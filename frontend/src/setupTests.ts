import '@testing-library/jest-dom';

if (typeof crypto.randomUUID !== 'function') {
  const { randomUUID } = require('crypto');
  crypto.randomUUID = randomUUID;
}
