-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AuditLogSource" AS ENUM ('USER_ACTION', 'SYSTEM_JOB', 'API_INTEGRATION', 'MIGRATION');

-- CreateEnum
CREATE TYPE "FinancialYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FinancialPeriodStatus" AS ENUM ('OPEN', 'LOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FolderContextType" AS ENUM ('SYSTEM', 'COMPANY', 'PROJECT', 'DEPARTMENT', 'USER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "NumberSeriesResetFrequency" AS ENUM ('NEVER', 'YEARLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "CostCentreType" AS ENUM ('DIRECT', 'INDIRECT', 'OVERHEAD');

-- CreateEnum
CREATE TYPE "CompanySettingDataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "DataScopeType" AS ENUM ('COMPANY', 'BRANCH', 'DIVISION', 'DEPARTMENT', 'PROJECT', 'SELF');

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "registration_number" TEXT,
    "vat_number" TEXT,
    "logo_url" TEXT,
    "base_currency" TEXT NOT NULL DEFAULT 'USD',
    "default_language" TEXT NOT NULL DEFAULT 'en',
    "default_timezone" TEXT NOT NULL DEFAULT 'UTC',
    "default_date_format" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_setting" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "data_type" "CompanySettingDataType" NOT NULL DEFAULT 'STRING',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "company_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "is_head_office" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "division" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centre" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CostCentreType" NOT NULL DEFAULT 'DIRECT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "cost_centre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "grade" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_year" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FinancialYearStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "financial_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_period" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "financial_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FinancialPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "is_adjustment_period" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "financial_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_series" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "sequence_name" TEXT NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 5,
    "reset_frequency" "NumberSeriesResetFrequency" NOT NULL DEFAULT 'NEVER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "number_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "department_id" TEXT,
    "position_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "preferred_language" TEXT,
    "preferred_timezone" TEXT,
    "preferred_date_format" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_info" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "parent_role_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system_role" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "can_approve" BOOLEAN NOT NULL DEFAULT false,
    "can_export" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_scope" (
    "id" TEXT NOT NULL,
    "user_role_id" TEXT NOT NULL,
    "scope_type" "DataScopeType" NOT NULL,
    "scope_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "data_scope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "company_id" TEXT NOT NULL,
    "session_id" TEXT,
    "correlation_id" TEXT,
    "batch_id" TEXT,
    "source" "AuditLogSource" NOT NULL DEFAULT 'USER_ACTION',
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "record_reference" TEXT,
    "before_value" JSONB,
    "after_value" JSONB,
    "ip_address" TEXT,
    "device_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_template" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subject_template" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "template_id" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_folder" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "context_type" "FolderContextType" NOT NULL,
    "context_id" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "document_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "expiry_date" DATE,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_version" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "change_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access" (
    "id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_upload" BOOLEAN NOT NULL DEFAULT false,
    "can_download" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "document_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_definition" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data_source" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "filters" JSONB NOT NULL DEFAULT '[]',
    "grouping" JSONB NOT NULL DEFAULT '[]',
    "sorting" JSONB NOT NULL DEFAULT '[]',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "report_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedule" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "cron_expression" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'PDF',
    "recipients" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "report_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_widget" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "widget_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "position_x" INTEGER NOT NULL DEFAULT 0,
    "position_y" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 4,
    "height" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "dashboard_widget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_company_deleted_at" ON "company"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_company_setting_company_id" ON "company_setting"("company_id");

-- CreateIndex
CREATE INDEX "idx_company_setting_company_deleted" ON "company_setting"("company_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_company_setting_company_module_key" ON "company_setting"("company_id", "module", "key");

-- CreateIndex
CREATE INDEX "idx_branch_company_id" ON "branch"("company_id");

-- CreateIndex
CREATE INDEX "idx_branch_company_deleted" ON "branch"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_division_company_id" ON "division"("company_id");

-- CreateIndex
CREATE INDEX "idx_division_company_deleted" ON "division"("company_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_division_company_code" ON "division"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_department_company_id" ON "department"("company_id");

-- CreateIndex
CREATE INDEX "idx_department_company_deleted" ON "department"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_department_division_id" ON "department"("division_id");

-- CreateIndex
CREATE INDEX "idx_department_branch_id" ON "department"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_department_company_code" ON "department"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_cost_centre_company_id" ON "cost_centre"("company_id");

-- CreateIndex
CREATE INDEX "idx_cost_centre_company_deleted" ON "cost_centre"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_cost_centre_department_id" ON "cost_centre"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_cost_centre_company_code" ON "cost_centre"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_position_company_id" ON "position"("company_id");

-- CreateIndex
CREATE INDEX "idx_position_company_deleted" ON "position"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_position_department_id" ON "position"("department_id");

-- CreateIndex
CREATE INDEX "idx_financial_year_company_id" ON "financial_year"("company_id");

-- CreateIndex
CREATE INDEX "idx_financial_period_company_id" ON "financial_period"("company_id");

-- CreateIndex
CREATE INDEX "idx_financial_period_year_id" ON "financial_period"("financial_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_financial_period_year_number" ON "financial_period"("financial_year_id", "period_number");

-- CreateIndex
CREATE INDEX "idx_number_series_company_id" ON "number_series"("company_id");

-- CreateIndex
CREATE INDEX "idx_number_series_company_deleted" ON "number_series"("company_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_number_series_company_doc_type" ON "number_series"("company_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "uq_number_series_sequence_name" ON "number_series"("sequence_name");

-- CreateIndex
CREATE INDEX "idx_user_company_id" ON "user"("company_id");

-- CreateIndex
CREATE INDEX "idx_user_company_deleted" ON "user"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_user_branch_id" ON "user"("branch_id");

-- CreateIndex
CREATE INDEX "idx_user_department_id" ON "user"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_company_email" ON "user"("company_id", "email");

-- CreateIndex
CREATE INDEX "idx_user_session_user_id" ON "user_session"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_session_company_id" ON "user_session"("company_id");

-- CreateIndex
CREATE INDEX "idx_user_session_expires_at" ON "user_session"("expires_at");

-- CreateIndex
CREATE INDEX "idx_password_reset_token_user_id" ON "password_reset_token"("user_id");

-- CreateIndex
CREATE INDEX "idx_password_reset_token_expires_at" ON "password_reset_token"("expires_at");

-- CreateIndex
CREATE INDEX "idx_role_company_id" ON "role"("company_id");

-- CreateIndex
CREATE INDEX "idx_role_company_deleted" ON "role"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_role_parent_role_id" ON "role"("parent_role_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_role_company_name" ON "role"("company_id", "name");

-- CreateIndex
CREATE INDEX "idx_user_role_user_id" ON "user_role"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_role_role_id" ON "user_role"("role_id");

-- CreateIndex
CREATE INDEX "idx_user_role_deleted_at" ON "user_role"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_role_user_role" ON "user_role"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_permission_module_action" ON "permission"("module", "action");

-- CreateIndex
CREATE INDEX "idx_role_permission_role_id" ON "role_permission"("role_id");

-- CreateIndex
CREATE INDEX "idx_role_permission_permission_id" ON "role_permission"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_role_permission_role_permission" ON "role_permission"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "idx_data_scope_user_role_id" ON "data_scope"("user_role_id");

-- CreateIndex
CREATE INDEX "idx_data_scope_deleted_at" ON "data_scope"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_audit_log_company_id" ON "audit_log"("company_id");

-- CreateIndex
CREATE INDEX "idx_audit_log_user_id" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "idx_audit_log_session_id" ON "audit_log"("session_id");

-- CreateIndex
CREATE INDEX "idx_audit_log_module_action" ON "audit_log"("module", "action");

-- CreateIndex
CREATE INDEX "idx_audit_log_created_at" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "idx_notification_template_company_id" ON "notification_template"("company_id");

-- CreateIndex
CREATE INDEX "idx_notification_template_company_deleted" ON "notification_template"("company_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_notification_template_company_event_channel" ON "notification_template"("company_id", "event_type", "channel");

-- CreateIndex
CREATE INDEX "idx_notification_company_id" ON "notification"("company_id");

-- CreateIndex
CREATE INDEX "idx_notification_recipient_id" ON "notification"("recipient_id");

-- CreateIndex
CREATE INDEX "idx_notification_status" ON "notification"("status");

-- CreateIndex
CREATE INDEX "idx_notification_created_at" ON "notification"("created_at");

-- CreateIndex
CREATE INDEX "idx_notification_preference_user_id" ON "notification_preference"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_notification_preference_user_event" ON "notification_preference"("user_id", "event_type");

-- CreateIndex
CREATE INDEX "idx_document_folder_company_id" ON "document_folder"("company_id");

-- CreateIndex
CREATE INDEX "idx_document_folder_company_deleted" ON "document_folder"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_document_folder_parent_id" ON "document_folder"("parent_id");

-- CreateIndex
CREATE INDEX "idx_document_folder_context" ON "document_folder"("context_type", "context_id");

-- CreateIndex
CREATE INDEX "idx_document_company_id" ON "document"("company_id");

-- CreateIndex
CREATE INDEX "idx_document_company_deleted" ON "document"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_document_folder_id" ON "document"("folder_id");

-- CreateIndex
CREATE INDEX "idx_document_version_document_id" ON "document_version"("document_id");

-- CreateIndex
CREATE INDEX "idx_document_version_uploaded_by" ON "document_version"("uploaded_by");

-- CreateIndex
CREATE UNIQUE INDEX "uq_document_version_doc_number" ON "document_version"("document_id", "version_number");

-- CreateIndex
CREATE INDEX "idx_document_access_folder_id" ON "document_access"("folder_id");

-- CreateIndex
CREATE INDEX "idx_document_access_role_id" ON "document_access"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_document_access_folder_role" ON "document_access"("folder_id", "role_id");

-- CreateIndex
CREATE INDEX "idx_report_definition_company_id" ON "report_definition"("company_id");

-- CreateIndex
CREATE INDEX "idx_report_definition_company_deleted" ON "report_definition"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_report_definition_created_by" ON "report_definition"("created_by");

-- CreateIndex
CREATE INDEX "idx_report_schedule_report_id" ON "report_schedule"("report_id");

-- CreateIndex
CREATE INDEX "idx_dashboard_widget_company_id" ON "dashboard_widget"("company_id");

-- CreateIndex
CREATE INDEX "idx_dashboard_widget_role_id" ON "dashboard_widget"("role_id");

-- CreateIndex
CREATE INDEX "idx_dashboard_widget_company_deleted" ON "dashboard_widget"("company_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "company_setting" ADD CONSTRAINT "company_setting_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch" ADD CONSTRAINT "branch_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "division" ADD CONSTRAINT "division_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centre" ADD CONSTRAINT "cost_centre_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centre" ADD CONSTRAINT "cost_centre_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_year" ADD CONSTRAINT "financial_year_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_period" ADD CONSTRAINT "financial_period_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_period" ADD CONSTRAINT "financial_period_financial_year_id_fkey" FOREIGN KEY ("financial_year_id") REFERENCES "financial_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_series" ADD CONSTRAINT "number_series_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_parent_role_id_fkey" FOREIGN KEY ("parent_role_id") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_scope" ADD CONSTRAINT "data_scope_user_role_id_fkey" FOREIGN KEY ("user_role_id") REFERENCES "user_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "user_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_template" ADD CONSTRAINT "notification_template_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_folder" ADD CONSTRAINT "document_folder_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_folder" ADD CONSTRAINT "document_folder_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "document_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "document_folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access" ADD CONSTRAINT "document_access_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "document_folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access" ADD CONSTRAINT "document_access_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_definition" ADD CONSTRAINT "report_definition_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_definition" ADD CONSTRAINT "report_definition_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedule" ADD CONSTRAINT "report_schedule_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "report_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widget" ADD CONSTRAINT "dashboard_widget_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widget" ADD CONSTRAINT "dashboard_widget_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
