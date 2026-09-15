require("dotenv").config();

const { PostgresBackend } = require("@agendajs/postgres-backend");
const { Agenda } = require("agenda");
const { Pool } = require("pg");

// Agenda owns a dedicated pool so its lifecycle cannot interfere with Prisma.
const agendaPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 30000,
});

const agenda = new Agenda({
  backend: new PostgresBackend({ pool: agendaPool }),
});

// PostgresBackend does not close externally supplied pools.
agenda.databasePool = agendaPool;

module.exports = agenda;
