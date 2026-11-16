-- FolderContextType.ASSET_REQUEST exists in schema.prisma but was never covered by a migration (schema drift).
ALTER TYPE "FolderContextType" ADD VALUE IF NOT EXISTS 'ASSET_REQUEST';
