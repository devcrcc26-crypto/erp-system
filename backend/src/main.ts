// Logger is NestJs buit-in logger for printing structured logs to the console
// ValidationPipe is a built-in pipe for validating the request data (DTOs)
import { Logger, ValidationPipe } from '@nestjs/common';
// ConfigService is a built-in service for accessing the configuration (enviromental variables like PORT, API_PREFIX, CORS_ORIGIN, etc.)
import { ConfigService } from '@nestjs/config';
// NestFactory is a factory for creating the Nest application instance
import { NestFactory } from '@nestjs/core';
// DocumentBuilder is a builder for the Swagger documentation
// SwaggerModule is a module for setting up the Swagger documentation
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// helmet is a middleware for securing the HTTP headers, this protects the application from common web vulnerabilities
import helmet from 'helmet';
// AppModule is the root module of the application, this is entry point for the application
import { AppModule } from './app.module';
import { getAutoApproveModeFromEnv } from './shared/config/auto-approve.mode';

// Async function that starts the application

async function bootstrap(): Promise<void> {

  // Create the Nest application instance
  const app = await NestFactory.create(AppModule);

  // Get the ConfigService instance from the Nest dependencies injection system
  const config = app.get(ConfigService);

  // Get the port from the configuration
  const port = config.get<number>('PORT', 3001);

  // Get the API prefix from the configuration, eg /api/users, /api/admin, etc.
  const apiPrefix = config.get<string>('API_PREFIX', 'api');

  // Set the global prefix for the application, eg /api/users, /api/admin, etc.
  app.setGlobalPrefix(apiPrefix);

  // Use the helmet middleware to secure the HTTP headers
  app.use(helmet());

  // Enable CORS for the application, this allows the application to be accessed from other domains
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
    exposedHeaders: [
      'Content-Disposition',
      'X-Payroll-Bank-Letter-Ref',
      'X-Payroll-Excluded-Accounts',
      'X-Payroll-Excluded-Count',
    ],
  });

  // Use the ValidationPipe to validate the request data (DTOs)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const swaggerExplicit = config.get<boolean>('SWAGGER_ENABLED') === true;
  const swaggerEnabled = nodeEnv !== 'production' || swaggerExplicit;

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Construction ERP API')
      .setDescription('Core Foundation module REST API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  const autoApprove = getAutoApproveModeFromEnv();
  if (autoApprove.ignoredNonLocal) {
    Logger.error(
      'AUTO_APPROVE_ALL ignored: not a local database.',
      'Bootstrap',
    );
  } else if (autoApprove.active) {
    Logger.warn(
      '⚠ AUTO-APPROVE MODE: all approval requests are approved automatically',
      'Bootstrap',
    );
  }

  await app.listen(port, '0.0.0.0');
  Logger.log(`Backend running on http://localhost:${port}/${apiPrefix}`, 'Bootstrap');
  if (swaggerEnabled) {
    Logger.log(
      `Swagger docs at http://localhost:${port}/${apiPrefix}/docs`,
      'Bootstrap',
    );
  } else {
    Logger.log('Swagger docs disabled (production without SWAGGER_ENABLED)', 'Bootstrap');
  }
}

void bootstrap();
