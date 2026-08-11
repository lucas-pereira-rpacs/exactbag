const EventEmitter = require('events');

class JobQueueService extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.handlers = new Map();
    this.pending = [];
    this.dedupeKeys = new Map(); // 🟢 P10: Track dedupe keys com TTL
    this.activeDedupeJobs = new Map(); // dedupeKey -> jobId (lookup O(1))
    // 🚀 BOOST: Aumentar throughput de 4 → 10 jobs concorrentes (+150%)
    const defaultMaxConcurrent = process.env.NODE_ENV === 'production' ? 6 : 10;
    this.maxConcurrent = Number(process.env.JOB_MAX_CONCURRENT || defaultMaxConcurrent);
    this.inFlight = 0;
    // Em produção, aumentar intervalo para economizar CPU
    // Em desenvolvimento, manter rápido para testes
    const defaultInterval = process.env.NODE_ENV === 'production' ? 1000 : 250;
    this.processInterval = Number(process.env.JOB_PROCESS_INTERVAL_MS || defaultInterval);
    this.lastRun = Date.now();
    
    // ⚡ Memory optimization: cleanup completed/failed jobs after TTL
    this.maxAge = 2 * 60 * 60 * 1000; // 2 hours (was 24h — saves ~20MB RAM)
    this.cleanupInterval = 10 * 60 * 1000; // Run cleanup every 10 min (was 1h)
    this._startCleanup();
    
    // 🟢 P10: Cleanup dedupe keys after 1 hour
    this.dedupeCleanupInterval = 60 * 60 * 1000; // 1 hour
    this._startDedupeCleanup();

    this._startWorker();
  }

  registerHandler(jobType, handler) {
    this.handlers.set(jobType, handler);
  }

  async addJob(jobType, data, options = {}) {
    const jobId = `${jobType}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    // dedupe (evita reprocessar a mesma venda se chamada de novo pelo partner)
    if (options.dedupeKey) {
      const existingJobId = this.activeDedupeJobs.get(options.dedupeKey);
      const existingJob = existingJobId ? this.jobs.get(existingJobId) : null;
      const existingIsActive = existingJob && (
        existingJob.status === 'pending' ||
        existingJob.status === 'running' ||
        existingJob.status === 'retrying'
      );

      if (existingIsActive) {
        this.dedupeKeys.set(options.dedupeKey, Date.now());
        return existingJob;
      }

      this.dedupeKeys.set(options.dedupeKey, Date.now());
      this.activeDedupeJobs.set(options.dedupeKey, jobId);
    }

    const job = {
      id: jobId,
      type: jobType,
      data,
      dedupeKey: options.dedupeKey || null,
      attempts: options.attempts || 5, // 🚀 BOOST: Aumentado de 3 → 5 attempts
      delayMs: options.delayMs || 0,
      attempt: 0,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.jobs.set(jobId, job);

    const process = async () => {
      const handler = this.handlers.get(jobType);
      if (!handler) {
        job.status = 'failed';
        job.updatedAt = new Date();
        this.emit('failed', job, new Error(`No handler for job type ${jobType}`));
        return;
      }

      job.attempt += 1;
      job.status = 'running';
      job.updatedAt = new Date();
      this.emit('started', job);

      try {
        await handler(job.data, job);
        job.status = 'completed';
        job.updatedAt = new Date();
        if (job.dedupeKey && this.activeDedupeJobs.get(job.dedupeKey) === job.id) {
          this.activeDedupeJobs.delete(job.dedupeKey);
        }
        this.emit('completed', job);
      } catch (error) {
        if (job.attempt < job.attempts) {
          job.status = 'pending'; // reset to pending so cleanup can reclaim stale retries
          job.updatedAt = new Date();
          this.emit('retrying', job, error);
          // 🚀 BOOST: Exponential backoff (1s → 2s → 4s → 8s)
          const backoffDelay = Math.min(1000 * Math.pow(2, job.attempt - 1), 30000);
          setTimeout(() => this.pending.push({ job, process }), backoffDelay);
        } else {
          job.status = 'failed';
          job.updatedAt = new Date();
          if (job.dedupeKey && this.activeDedupeJobs.get(job.dedupeKey) === job.id) {
            this.activeDedupeJobs.delete(job.dedupeKey);
          }
          this.emit('failed', job, error);
        }
      }
    };

    if (job.delayMs > 0) {
      setTimeout(() => this.pending.push({ job, process }), job.delayMs);
    } else {
      this.pending.push({ job, process });
    }

    return job;
  }

  _startWorker() {
    this.worker = setInterval(async () => {
      if (this.inFlight >= this.maxConcurrent || this.pending.length === 0) {
        return;
      }

      const { job, process } = this.pending.shift();
      this.inFlight += 1;
      try {
        await process();
      } finally {
        this.inFlight -= 1;
      }
    }, this.processInterval);
  }

  // ⚡ Cleanup completed/failed jobs to prevent memory leaks
  _startCleanup() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let removed = 0;
      
      for (const [id, job] of this.jobs) {
        const age = now - job.createdAt.getTime();
        // Remove jobs older than maxAge and not actively pending/running
        if (age > this.maxAge && job.status !== 'pending' && job.status !== 'running') {
          this.jobs.delete(id);
          removed++;
        }
      }
      
      if (removed > 0) {
        console.log(`[JobQueue] 🧹 Cleanup: removed ${removed} old jobs`);
      }
    }, this.cleanupInterval);
  }

  // 🟢 P10: Cleanup expired dedupe keys
  _startDedupeCleanup() {
    this.dedupeCleanupTimer = setInterval(() => {
      const now = Date.now();
      let removed = 0;
      const dedupeMaxAge = 1 * 60 * 60 * 1000; // 1 hour TTL for dedupe keys

      for (const [key, timestamp] of this.dedupeKeys) {
        if (now - timestamp > dedupeMaxAge) {
          this.dedupeKeys.delete(key);
          removed++;
        }
      }

      if (removed > 0) {
        console.log(`[JobQueue] 🧹 Dedupe Cleanup: removed ${removed} old dedupe keys`);
      }
    }, this.dedupeCleanupInterval);
  }

  shutdown() {
    clearInterval(this.worker);
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    // 🟢 P10: Clear dedupe cleanup timer
    if (this.dedupeCleanupTimer) {
      clearInterval(this.dedupeCleanupTimer);
    }
    this.activeDedupeJobs.clear();
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  getJobs(limit = 100, offset = 0) {
    const all = Array.from(this.jobs.values());
    if (limit <= 0) return all; // backward compat: pass 0 for all
    return all.slice(offset, offset + limit);
  }

  getJobCounts() {
    let pending = 0, running = 0, completed = 0, failed = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'pending') pending++;
      else if (job.status === 'running') running++;
      else if (job.status === 'completed') completed++;
      else if (job.status === 'failed') failed++;
    }
    return { pending, running, completed, failed, total: this.jobs.size };
  }
}

module.exports = new JobQueueService();