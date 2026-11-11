import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// Undo mistaken global @db.Timestamp(6) on deletedAt (approval tables re-added below).
schema = schema.replace(
  /deletedAt(\s+\w+\??)(\s+)@map\("deleted_at"\) @db\.Timestamp\(6\)/g,
  'deletedAt$1$2@map("deleted_at")',
);

// Keep timestamp(6) only on approval workflow tables.
const approvalModels = ['ApprovalCategory', 'ApprovalRequest', 'ApprovalTier', 'ApprovalComment'];
for (const model of approvalModels) {
  schema = schema.replace(
    new RegExp(`(model ${model} \\{[\\s\\S]*?)(deletedAt\\s+DateTime\\?\\s+@map\\("deleted_at"\\))`, 'm'),
    '$1deletedAt         DateTime? @map("deleted_at") @db.Timestamp(6)',
  );
}

fs.writeFileSync(schemaPath, schema);
console.log('Removed mistaken deletedAt timestamps.');
