import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Lets `node --test` load modules that import '@/…', which until now meant
// only alias-free files under src/lib could be tested at all.
register('./alias-resolver.mjs', pathToFileURL(`${import.meta.dirname}/`));
