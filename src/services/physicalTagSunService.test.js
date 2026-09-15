jest.mock('../config', () => ({ prisma: null }));

const { validateSun } = require('./physicalTagSunService');

describe('validateSun', () => {
  test('rejects a non-insured SUN with fewer digits than the configured last SUN', async () => {
    await expect(validateSun('9110001')).resolves.toMatchObject({
      valid: false,
      code: 'SUN_INVALID'
    });
  });

  test('accepts an 8-digit non-insured SUN inside the configured range', async () => {
    await expect(validateSun('91200000')).resolves.toMatchObject({
      valid: true,
      insured: false,
      normalized: '91200000'
    });
  });

  test('keeps the insured SUN format working', async () => {
    await expect(validateSun('S1020000')).resolves.toMatchObject({
      valid: true,
      insured: true,
      normalized: '1020000'
    });
  });
});
