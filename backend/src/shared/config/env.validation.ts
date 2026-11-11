import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3001),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
  FRONTEND_URL: Joi.string().default('http://localhost:3000'),
  /** When true, expose Swagger even if NODE_ENV=production. */
  SWAGGER_ENABLED: Joi.boolean()
    .truthy('true', '1', 1)
    .falsy('false', '0', 0)
    .default(false),
  THROTTLE_LIMIT: Joi.number().default(300),
  DATABASE_URL: Joi.string().required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  REDIS_ENABLED: Joi.boolean()
    .truthy('true', '1', 1)
    .falsy('false', '0', 0)
    .default(false),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  STORAGE_PROVIDER: Joi.string()
    .valid('minio', 's3', 'azure', 'gcs')
    .default('minio'),
  MINIO_ENDPOINT: Joi.string().default('localhost'),
  MINIO_PORT: Joi.number().default(9000),
  MINIO_ACCESS_KEY: Joi.string().optional(),
  MINIO_SECRET_KEY: Joi.string().optional(),
  MINIO_USE_SSL: Joi.boolean().default(false),
  MAIL_HOST: Joi.string().optional(),
  MAIL_PORT: Joi.number().optional(),
  MAIL_FROM: Joi.string().optional(),
  RESEND_API_KEY: Joi.string().optional(),
  NOTIFICATION_RETENTION_DAYS: Joi.number().default(90),
  SEED_MODE: Joi.boolean()
    .truthy('true', '1', 1)
    .falsy('false', '0', 0)
    .default(false),
  EMAIL_DISABLED: Joi.boolean()
    .truthy('true', '1', 1)
    .falsy('false', '0', 0)
    .default(false),
  AUTO_APPROVE_ALL: Joi.boolean()
    .truthy('true', '1', 1)
    .falsy('false', '0', 0)
    .default(false),
  AUTO_APPROVE_ACTOR_ID: Joi.string()
    .uuid()
    .default('16040ab7-b923-4fe4-87cf-cc3a916c7325'),
  PM_MODULE_ENABLED: Joi.boolean()
    .truthy('true', '1', 1)
    .falsy('false', '0', 0)
    .default(false),
});
