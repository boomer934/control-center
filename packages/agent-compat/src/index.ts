import { z } from 'zod';
import data from '../compat.json';

// The version is bounded before matching; prerelease separators cannot match identifiers.
const exactVersion =
  // eslint-disable-next-line security/detect-unsafe-regex
  /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}(?:-[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*)?$/;
const version = z.string().refine((value) => value.length <= 80 && exactVersion.test(value));
const tested = z
  .array(version)
  .min(1)
  .refine((versions) => new Set(versions).size === versions.length);
const model = z.strictObject({
  id: z
    .string()
    .max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/),
  label: z.string().min(1).max(100),
});

export const compatSchema = z.strictObject({
  claude: z.strictObject({
    tested,
    fallbackModels: z
      .array(model)
      .min(1)
      .max(64)
      .refine((models) => new Set(models.map(({ id }) => id)).size === models.length),
    fallbackEfforts: z
      .array(z.string().regex(/^[a-z][a-z0-9-]{0,23}$/))
      .min(1)
      .max(8)
      .refine((efforts) => new Set(efforts).size === efforts.length),
  }),
  codex: z.strictObject({ tested }),
});

export const agentCompat = compatSchema.parse(data);
