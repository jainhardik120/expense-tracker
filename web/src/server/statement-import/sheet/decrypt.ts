import officeCrypto from 'officecrypto-tool';

import { StatementPasswordError } from '../pdf/extract';

export const readSheetData = async (data: Uint8Array, passwords: Array<string | undefined>) => {
  const buffer = Buffer.from(data);
  if (!officeCrypto.isEncrypted(buffer)) {
    return { data, password: undefined };
  }
  const known = passwords.filter((password) => typeof password === 'string');
  for (const password of known) {
    try {
      return { data: new Uint8Array(await officeCrypto.decrypt(buffer, { password })), password };
    } catch {
      continue;
    }
  }
  throw new StatementPasswordError(known.length === 0);
};
