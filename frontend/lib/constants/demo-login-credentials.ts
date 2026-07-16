export const DEMO_PASSWORD = 'Admin@12345';

export interface DemoLoginAccount {
  readonly email: string;
  readonly role: string;
  readonly name: string;
  readonly highlight?: string;
}

/** Seeded demo accounts — password is the same for all (DEMO_PASSWORD). */
export const DEMO_LOGIN_ACCOUNTS: DemoLoginAccount[] = [
  { email: 'admin@company.local', role: 'System Administrator', name: 'Admin User', highlight: 'Full access' },
  { email: 'pm@company.local', role: 'Project Manager', name: 'Ahmed Hassan' },
  { email: 'engineer@company.local', role: 'Site Engineer', name: 'Sara Khalil' },
  { email: 'docs@company.local', role: 'Document Controller', name: 'Layla Mansour' },
  { email: 'safety@company.local', role: 'Safety Officer', name: 'Omar Farouk' },
  { email: 'reviewer@company.local', role: 'Reviewer', name: 'Nadia Saleh', highlight: 'Review inbox' },
  { email: 'lead@company.local', role: 'Discipline Lead', name: 'Khalid Nasser', highlight: 'Lead tier approvals' },
  { email: 'owner@company.local', role: 'Discipline Owner', name: 'Hassan Al-Rashid', highlight: 'Owner tier — DEMO-001 / PDR' },
  { email: 'deptchief@company.local', role: 'Department Chief', name: 'Rania Aziz', highlight: 'Dept chief tier — DEMO-002' },
  { email: 'deputychief@company.local', role: 'Deputy Chief', name: 'Youssef Hamdan' },
  { email: 'sitecoord@company.local', role: 'Site Coordinator', name: 'Maya Fahad' },
  { email: 'consultant@company.local', role: 'Client Consultant', name: 'Elena Petrova' },
  { email: 'demo.seed.designer@company.local', role: 'Designer', name: 'Wei Chen', highlight: 'Creates subtasks — LJZ' },
  { email: 'demo.seed.dispatcher@company.local', role: 'Dispatcher', name: 'Jun Wang' },
  { email: 'demo.seed.institute@company.local', role: 'Institute Chief', name: 'Li Zhang', highlight: 'Institute tier — LJZ' },
  { email: 'demo.seed.gm@company.local', role: 'General Manager', name: 'David Wu' },
];
