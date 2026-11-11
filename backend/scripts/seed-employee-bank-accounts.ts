/**
 * Seed / update User.bankAccountNumber from a name → account list.
 *
 * Matching (in order):
 * 1. loginName exact (normalized)
 * 2. collapsed first+middle (+ optional last) against DB firstName[+lastName]
 * 3. unique / ordered-by-employeeId first-name-only for remaining duplicates
 *
 * Usage (from backend/):
 *   $env:SEED_MODE='true'
 *   npx ts-node --transpile-only scripts/seed-employee-bank-accounts.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { assertLocalhostSeedGuards } from './lib/localhost-seed-guard';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';

const ACCOUNTS: ReadonlyArray<{ name: string; account: string }> = [
  { name: 'Ababo Gereme', account: '1000749646806' },
  { name: 'Abenezer Abadi', account: '1000263693209' },
  { name: 'Abenezer Tilahun', account: '1000064319756' },
  { name: 'Abireham Yishak', account: '1000021600559' },
  { name: 'Abiyu Bekele', account: '1000132401474' },
  { name: 'Adonay Desta', account: '1000064306395' },
  { name: 'Agegahegn Tefera', account: '1000090461811' },
  { name: 'Agegnehu Gelaw', account: '1000331154788' },
  { name: 'Armias Habtu', account: '1000475127203' },
  { name: 'Ayelech Worku', account: '1000543862081' },
  { name: 'Beru Yargale', account: '1000236694608' },
  { name: 'Beshatu Senbete', account: '1000376983629' },
  { name: 'Birhanu Weldu', account: '1000031829864' },
  { name: 'Biruk Alemu', account: '1000111817662' },
  { name: 'Dagmawi Tesfaye', account: '1000349652758' },
  { name: 'Dame Daba', account: '1000137462177' },
  { name: 'Dinberu Alemu', account: '1000223688873' },
  { name: 'Eden Alemu', account: '1000679992604' },
  { name: 'Efeson Bassa', account: '1000244080891' },
  { name: 'Eskender Abebaw', account: '1000067441757' },
  { name: 'Estesegenet Degu', account: '1000270588194' },
  { name: 'Eyob Temesgen', account: '1000132340173' },
  { name: 'Eyuel Tilahun', account: '1000719210663' },
  { name: 'Habtamu Gizaw', account: '1000100205746' },
  { name: 'Hailab Getu', account: '1000162255022' },
  { name: 'Haile Micheal Mulugeta', account: '1000319093072' },
  { name: 'Hailu Tesfaye', account: '1000276876515' },
  { name: 'Haymanot Yigrem', account: '1000770084834' },
  { name: 'Heaven Jada', account: '1000101894968' },
  { name: 'Helen Abebaw', account: '1000155977276' },
  { name: 'Henok Shiferaw', account: '1000137508878' },
  { name: 'Israel Woldetsadik', account: '1000236485076' },
  { name: 'Kahsay Reda', account: '1000142960005' },
  { name: 'Kassaye Workie', account: '1000576570507' },
  { name: 'Kiber Temesgen', account: '1000277209137' },
  { name: 'Kidist Kabtiyemer', account: '1000507078641' },
  { name: 'Lakew Gulema Urge', account: '1000486640204' },
  { name: 'Leul Tesfaye', account: '1000287523312' },
  { name: 'Medhanit Berhanu', account: '1000106381376' },
  { name: 'Mekides Asfaw', account: '1000700248805' },
  { name: 'Mesfin Abi Mamuye', account: '1000259426007' },
  { name: 'Mestawet Adam', account: '1000302007229' },
  { name: 'Micheal Fetena', account: '1000033178507' },
  { name: 'Mihret Moges', account: '1000064215624' },
  { name: 'Mistereselassie Yonas', account: '1000028575347' },
  { name: 'Mizen Beyene', account: '1000326845497' },
  { name: 'Muse Asefa', account: '1000669230013' },
  { name: 'Nahili Deresa', account: '1000312154319' },
  { name: 'Nahom Alemayehu', account: '1000314344263' },
  { name: 'Nahom Asfaw', account: '1000433953324' },
  { name: 'Naod Kiflu', account: '1000409806809' },
  { name: 'Natnael Argaw', account: '1000254864319' },
  { name: 'Natnael Girma', account: '1000101157327' },
  { name: 'Natnael Mulatu', account: '1000064273187' },
  { name: 'Natnael Takele', account: '1000221974868' },
  { name: 'Nebiyu Namssi', account: '1000235772446' },
  { name: 'Netsihit Alemayehu', account: '1000006973829' },
  { name: 'Samrawit Adane', account: '1000319823275' },
  { name: 'Samuel H/mariam', account: '1000277227332' },
  { name: 'Seid Hussen', account: '1000037415093' },
  { name: 'Selamawit Beyene', account: '1000160766763' },
  { name: 'Shewaferahun Tesfaye', account: '1000360179153' },
  { name: 'Shimeles Ayele', account: '1000009642254' },
  { name: 'Shimelis Bacha', account: '1000268438614' },
  { name: 'Sisay Gedishu', account: '1000230177736' },
  { name: 'Sisay Tenna', account: '1000176028975' },
  { name: 'Soliyana Solomon', account: '1000233876554' },
  { name: 'Sony Aboye', account: '1000450162365' },
  { name: 'Surafel Seyoum', account: '1000259935885' },
  { name: 'Tariku Yideg', account: '1000221437156' },
  { name: 'Terefe Dabele', account: '1000059204762' },
  { name: 'TesfaMicheal Negera', account: '1000064260174' },
  { name: 'Tesfaye Tsega Beyin', account: '1000252367288' },
  { name: 'Tesfu Berhane', account: '1000065837696' },
  { name: 'Tewele Brhane', account: '1000145953441' },
  { name: 'Tewodros Desye Sisay', account: '1000114194518' },
  { name: 'Tsebaot Minda Tadesse', account: '1000138390636' },
  { name: 'Tsion Mekonnen', account: '1000388102806' },
  { name: 'Werknesh Tiruha', account: '1000695646268' },
  { name: 'Yared Ejigu', account: '1000062123404' },
  { name: 'Yemareshet Temesgen', account: '1000557009888' },
  { name: 'Yisak Assefa', account: '1000077751479' },
  { name: 'Yonas Bizualem', account: '1000458675558' },
  { name: 'Zelalem Sefiw', account: '1000092969658' },
  { name: 'Zerihun Lemesa', account: '1000062416576' },
  { name: 'Zeru Tasew', account: '1000156698133' },
  { name: 'Dagim Selemon', account: '1000327233355' },
  { name: 'Henok Tesfaye', account: '1000412058937' },
  { name: 'Biniam Gebreslassie', account: '1000001694751' },
  { name: 'Zewidu Habte', account: '1000326238736' },
  { name: 'Asli Mekonen', account: '1000181594636' },
  { name: 'Asaminew Kebede', account: '1000009816279' },
  { name: 'Habtu Mulat', account: '1000452876764' },
  { name: 'Dawit Gebre', account: '1000064306603' },
  { name: 'Aderaw Sitotaw', account: '1000310539396' },
];

type DbUser = {
  id: string;
  firstName: string;
  lastName: string;
  loginName: string | null;
  employeeId: string | null;
  bankAccountNumber: string | null;
};

function normalizeKey(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[/\-_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function collapse(value: string): string {
  return normalizeKey(value).replace(/\s+/g, '');
}

function tokens(name: string): string[] {
  return normalizeKey(name).split(' ').filter(Boolean);
}

/** first, first+middle, first+middle+last collapsed forms from a list name. */
function listMatchKeys(listName: string): string[] {
  const parts = tokens(listName);
  if (parts.length === 0) {
    return [];
  }
  const keys = new Set<string>();
  keys.add(collapse(parts[0]!));
  if (parts.length >= 2) {
    keys.add(collapse(`${parts[0]} ${parts[1]}`));
  }
  if (parts.length >= 3) {
    keys.add(collapse(parts.slice(0, 3).join(' ')));
  }
  keys.add(collapse(parts.join(' ')));

  // Spelling variants for known compound first names in DB.
  const full = normalizeKey(listName);
  if (full.startsWith('haile micheal') || full.startsWith('haile michael')) {
    keys.add('hailemicheal');
  }
  if (full.startsWith('tesfamicheal') || full.startsWith('tesfa micheal')) {
    keys.add('tesfamicheal');
  }
  if (full.startsWith('samuel h')) {
    keys.add('samuelhailemariam');
    keys.add('samuelhailemariamseifu');
  }
  if (full.startsWith('asli ')) {
    keys.add('asili');
  }
  if (full.startsWith('micheal fetena')) {
    keys.add('micheal');
  }

  return [...keys];
}

function dbIdentityKeys(user: DbUser): string[] {
  const keys = new Set<string>();
  const first = user.firstName.trim();
  const last = user.lastName.trim();
  keys.add(collapse(first));
  if (last) {
    keys.add(collapse(`${first} ${last}`));
  }
  if (user.loginName) {
    keys.add(collapse(user.loginName));
  }
  return [...keys];
}

function employeeIdSortKey(employeeId: string | null): string {
  return employeeId ?? '\uffff';
}

function lastNameFromList(listName: string): string {
  const parts = listName.trim().split(/\s+/);
  if (parts.length <= 1) {
    return '';
  }
  // Keep everything after the first token as lastName (middle + family).
  return parts.slice(1).join(' ');
}

async function main(): Promise<void> {
  assertLocalhostSeedGuards();
  const prisma = new PrismaClient();

  try {
    const users: DbUser[] = await prisma.user.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        loginName: true,
        employeeId: true,
        bankAccountNumber: true,
      },
    });

    const available = new Set(users.map((u) => u.id));

    /** collapsed identity → users (usually 1). */
    const byIdentity = new Map<string, DbUser[]>();
    for (const user of users) {
      for (const key of dbIdentityKeys(user)) {
        const list = byIdentity.get(key) ?? [];
        list.push(user);
        byIdentity.set(key, list);
      }
    }
    for (const list of byIdentity.values()) {
      list.sort((a, b) =>
        employeeIdSortKey(a.employeeId).localeCompare(
          employeeIdSortKey(b.employeeId),
        ),
      );
    }

    const byLogin = new Map<string, DbUser>();
    for (const user of users) {
      if (user.loginName) {
        byLogin.set(normalizeKey(user.loginName), user);
      }
    }

    let updated = 0;
    let unchanged = 0;
    let unmatched = 0;
    const unmatchedNames: string[] = [];

    const actor =
      users.find((u) => u.employeeId === 'CC-0059') ?? users[0] ?? null;

    for (const row of ACCOUNTS) {
      let matched: DbUser | undefined;

      const loginHit = byLogin.get(normalizeKey(row.name));
      if (loginHit && available.has(loginHit.id)) {
        matched = loginHit;
      }

      // Prefer longest match keys first (full name → first+middle → first).
      if (!matched) {
        const keys = listMatchKeys(row.name).sort(
          (a, b) => b.length - a.length,
        );
        for (const key of keys) {
          const candidates = (byIdentity.get(key) ?? []).filter((u) =>
            available.has(u.id),
          );
          if (candidates.length === 0) {
            continue;
          }
          // Unique identity, or first+middle uniquely resolved a compound DB firstName.
          if (candidates.length === 1 || key.length > collapse(tokens(row.name)[0] ?? '').length) {
            matched = candidates[0];
            break;
          }
        }
      }

      // Remaining duplicates (same first name only): consume by employeeId order.
      if (!matched) {
        const firstKey = collapse(tokens(row.name)[0] ?? '');
        const candidates = (byIdentity.get(firstKey) ?? []).filter((u) =>
          available.has(u.id),
        );
        if (candidates.length >= 1) {
          matched = candidates[0];
        }
      }

      if (!matched) {
        unmatched += 1;
        unmatchedNames.push(row.name);
        console.log(`MISS  ${row.name}  → ${row.account}`);
        continue;
      }

      available.delete(matched.id);

      const inferredLast = lastNameFromList(row.name);
      const shouldFixLastName =
        (!matched.lastName || matched.lastName.trim() === '') &&
        inferredLast.length > 0;

      if (matched.bankAccountNumber === row.account && !shouldFixLastName) {
        unchanged += 1;
        console.log(
          `OK    ${matched.employeeId ?? '-'}  ${matched.firstName}  already ${row.account}`,
        );
        continue;
      }

      await prisma.user.update({
        where: { id: matched.id },
        data: {
          bankAccountNumber: row.account,
          ...(shouldFixLastName ? { lastName: inferredLast } : {}),
          updatedBy: actor?.id ?? matched.id,
        },
      });
      updated += 1;
      console.log(
        `SET   ${matched.employeeId ?? '-'}  ${matched.firstName}${shouldFixLastName ? ` +last=${inferredLast}` : ''}  ${matched.bankAccountNumber ?? 'null'} → ${row.account}`,
      );
    }

    console.log('\n--- summary ---');
    console.log(`accounts in list : ${ACCOUNTS.length}`);
    console.log(`updated          : ${updated}`);
    console.log(`already correct  : ${unchanged}`);
    console.log(`unmatched        : ${unmatched}`);
    if (unmatchedNames.length > 0) {
      console.log('\nUnmatched:');
      for (const name of unmatchedNames) {
        console.log(`  - ${name}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
