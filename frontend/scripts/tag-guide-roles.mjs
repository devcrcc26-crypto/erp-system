/**
 * Wraps role-specific ## sections in public/guide/{en,zh}/*.md with
 * <!-- role: … --> … <!-- /role --> based on exact heading titles.
 *
 * Usage (from frontend/): node scripts/tag-guide-roles.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const guideRoot = path.join(root, 'public', 'guide');

/** @type {Record<string, Array<{ roles: string, headings: string[] }>>} */
const TAGS = {
  dashboard: [
    {
      roles: 'SUPERVISOR, HR',
      headings: ['What My Team shows', '我的团队显示什么'],
    },
    {
      roles: 'HR',
      headings: ['What the company views show', '公司视图显示什么'],
    },
  ],
  leave: [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to approve, return or reject a leave request',
        '如何批准、退回或拒绝请假申请',
        'How to request leave for someone in your team',
        '如何为团队成员申请休假',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to see all leave requests',
        '如何查看所有请假申请',
        'How to edit or delete a leave request',
        '如何编辑或删除请假申请',
        'How to view and adjust leave balances',
        '如何查看和调整假期余额',
        'How to import leave requests from Excel',
        '如何从 Excel 导入请假申请',
        'Things HR should know',
        '人事须知',
      ],
    },
  ],
  overtime: [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to approve, return or reject an overtime sheet',
        '如何批准、退回或拒绝加班表',
        'How to file overtime for someone in your team',
        '如何为团队成员填报加班',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to see all overtime sheets',
        '如何查看所有加班表',
        'How to change or delete overtime',
        '如何修改或删除加班',
        'How to import overtime from Excel',
        '如何从 Excel 导入加班',
        'Things HR should know',
        '人事须知',
      ],
    },
  ],
  approvals: [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to find requests waiting for you',
        '如何查找等待您处理的申请',
        'How to check a request before you decide',
        '决定前如何核对申请',
        'How to approve a request',
        '如何批准申请',
        'How to return a request',
        '如何退回申请',
        'How to reject a request',
        '如何拒绝申请',
        'How to approve on a condition',
        '如何有条件批准',
        'How to reassign a waiting step',
        '如何转派等待中的环节',
        'How to approve or return on behalf of another approver',
        '如何代其他审批人批准或退回',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to see every request and company reports',
        '如何查看所有申请和公司报表',
      ],
    },
  ],
  'site-assignments': [
    {
      roles: 'SUPERVISOR, HR',
      headings: [
        'How to create a site assignment for your team',
        '如何为团队成员创建现场派驻',
      ],
    },
    {
      roles: 'HR',
      headings: [
        "How to create a site assignment for a supervisor's team",
        '如何为主管的团队创建现场派驻',
        'How to see all site assignments',
        '如何查看所有现场派驻',
        'How to shorten a site assignment',
        '如何缩短现场派驻',
        'How to cancel a site assignment',
        '如何取消现场派驻',
        'Things HR should know',
        '人事须知',
      ],
    },
  ],
  'per-diem': [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to approve a per diem request',
        '如何审批差旅补贴申请',
      ],
    },
    {
      roles: 'HR',
      headings: [
        "How to set an employee's per diem rates",
        '如何设置员工的差旅补贴标准',
        'How to see all per diem requests',
        '如何查看所有差旅补贴申请',
        'How to record a disbursement',
        '如何记录拨款',
        'How to settle a request and record the balance',
        '如何结算申请并登记差额',
      ],
    },
  ],
  flight: [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to approve a flight application',
        '如何审批机票申请',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to see all flight applications',
        '如何查看所有机票申请',
        'How to attach tickets',
        '如何上传机票',
        'Things HR should know',
        '人事须知',
      ],
    },
  ],
  'expense-claims': [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to approve an expense claim',
        '如何审批费用报销',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to see all expense claims',
        '如何查看所有费用报销',
        'How to mark a claim as paid',
        '如何将报销标记为已支付',
        'How to delete an expense claim',
        '如何删除费用报销',
        'How to import or export expense claims',
        '如何导入或导出费用报销',
      ],
    },
  ],
  'exit-permit': [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to approve an exit permit',
        '如何审批出入证',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to see all exit permits',
        '如何查看所有出入证',
        'How to print a gate pass or the gate register',
        '如何打印出入门证或门岗登记',
        'Things HR should know',
        '人事须知',
      ],
    },
  ],
  seals: [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to approve a seal request',
        '如何审批用章申请',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to see all seal requests',
        '如何查看所有用章申请',
        'How to issue the seal',
        '如何用印',
        'How to export or import seal requests',
        '如何导出或导入用章申请',
        'Things HR should know',
        '人事须知',
      ],
    },
  ],
  'business-trips': [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to approve a business trip',
        '如何审批出差申请',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to see all business trips',
        '如何查看所有出差',
        'How to attach tickets',
        '如何上传机票',
        'Things HR should know',
        '人事须知',
      ],
    },
  ],
  'work-from-home': [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to approve a work-from-home request',
        '如何审批居家办公申请',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to assign work-from-home days directly',
        '如何直接分配居家办公日',
        'How to change or remove an assigned day',
        '如何修改或删除已分配的日期',
        'How to cancel an approved request',
        '如何取消已批准的申请',
      ],
    },
  ],
  vehicles: [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to approve a vehicle or refueling request',
        '如何审批用车或加油申请',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to see all vehicle requests',
        '如何查看所有车辆申请',
        'How to release a vehicle after the trip',
        '如何在行程结束后释放车辆',
        'How to upload a fuel receipt',
        '如何上传油费收据',
        'How to update an inspection or repair',
        '如何更新检修状态',
        'How to add a company vehicle',
        '如何添加公司车辆',
        'How to change, update or remove a company vehicle',
        '如何修改、更改状态或删除公司车辆',
        'Things HR should know',
        '人事须知',
      ],
    },
  ],
  materials: [
    {
      roles: 'HR, SUPERVISOR',
      headings: [
        'How to approve a materials or purchase request',
        '如何审批物料或采购申请',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to see all requests',
        '如何查看所有申请',
        'How to correct items on a draft or returned request',
        '如何更正草稿或已退回申请的明细',
        'Things HR should know',
        '人事须知',
      ],
    },
  ],
  announcements: [
    {
      roles: 'HR',
      headings: [
        'How to write a draft',
        '如何撰写草稿',
        'How to publish an announcement',
        '如何发布公告',
        'How to see who has read an announcement',
        '如何查看阅读情况',
        'How to edit a published announcement',
        '如何编辑已发布的公告',
        'How to post a system update',
        '如何发布系统更新',
      ],
    },
  ],
  evaluations: [
    {
      roles: 'SUPERVISOR, HR',
      headings: [
        'How to assess a team member',
        '如何评估团队成员',
        'How to assess and share a result',
        '如何评估并分享结果',
        'How to respond to a dispute',
        '如何回复异议',
      ],
    },
    {
      roles: 'HR',
      headings: [
        'How to set up an evaluation template',
        '如何设置考核模板',
        'How to run an evaluation cycle',
        '如何运行考核周期',
        'How to follow all evaluations',
        '如何跟踪所有考核',
        'How to decide an escalated dispute',
        '如何处理升级的异议',
        'How to file a finished evaluation',
        '如何归档已完成的考核',
      ],
    },
  ],
};

function isContinuationHeading(line) {
  return (
    /^##\s+Step\s+\d+/i.test(line) ||
    /^##\s+第\s*\d+\s*步/.test(line) ||
    /^##\s+Review\s*&\s*Submit/i.test(line) ||
    /^##\s+核对并提交/.test(line) ||
    /^##\s+确认并提交/.test(line)
  );
}

/**
 * @param {string} markdown
 * @param {string} heading
 * @param {string} roles
 */
function wrapHeading(markdown, heading, roles) {
  const open = `<!-- role: ${roles} -->`;
  const close = `<!-- /role -->`;
  if (markdown.includes(`${open}\n## ${heading}`)) {
    return { markdown, tagged: false };
  }
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) {
    return { markdown, tagged: false, missing: true };
  }
  if (start > 0 && /<!--\s*role:/i.test(lines[start - 1] ?? '')) {
    return { markdown, tagged: false };
  }

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end] ?? '';
    if (line.startsWith('## ') && !isContinuationHeading(line)) {
      break;
    }
    end += 1;
  }

  let insertEnd = end;
  while (insertEnd > start + 1 && !(lines[insertEnd - 1] ?? '').trim()) {
    insertEnd -= 1;
  }

  const before = lines.slice(0, start);
  const body = lines.slice(start, insertEnd);
  const after = lines.slice(insertEnd);
  return {
    markdown: [...before, open, ...body, close, '', ...after].join('\n'),
    tagged: true,
  };
}

let missing = 0;
let tagged = 0;

for (const lang of ['en', 'zh']) {
  for (const [slug, entries] of Object.entries(TAGS)) {
    const filePath = path.join(guideRoot, lang, `${slug}.md`);
    let markdown;
    try {
      markdown = readFileSync(filePath, 'utf8');
    } catch {
      console.warn(`skip missing ${lang}/${slug}.md`);
      continue;
    }
    let changed = false;
    for (const entry of entries) {
      for (const heading of entry.headings) {
        // Only try headings that match the language script roughly.
        const looksZh = /[\u4e00-\u9fff]/.test(heading);
        if (lang === 'en' && looksZh) continue;
        if (lang === 'zh' && !looksZh) continue;

        const result = wrapHeading(markdown, heading, entry.roles);
        if (result.missing) {
          console.warn(`  MISSING [${lang}/${slug}] ## ${heading}`);
          missing += 1;
          continue;
        }
        if (result.tagged) {
          markdown = result.markdown;
          changed = true;
          tagged += 1;
          console.log(`  [${lang}/${slug}] ${entry.roles} ← ## ${heading}`);
        }
      }
    }
    if (changed) {
      writeFileSync(
        filePath,
        markdown.endsWith('\n') ? markdown : `${markdown}\n`,
        'utf8',
      );
    }
  }
}

console.log(`Done. tagged=${tagged} missing=${missing}`);
