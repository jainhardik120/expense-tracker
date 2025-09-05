import { customAlphabet } from 'nanoid';

const prefixes: Record<string, string> = {};

interface GenerateIdOptions {
  length?: number;
  separator?: string;
}

export const generateId = (
  prefixOrOptions?: keyof typeof prefixes | GenerateIdOptions,
  inputOptions: GenerateIdOptions = {},
) => {
  const finalOptions = typeof prefixOrOptions === 'object' ? prefixOrOptions : inputOptions;

  const prefix = typeof prefixOrOptions === 'object' ? undefined : prefixOrOptions;

  const { length = 12, separator = '_' } = finalOptions;
  const id = customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    length,
  )();

  return prefix === undefined ? id : `${prefixes[prefix]}${separator}${id}`;
};
