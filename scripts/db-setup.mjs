// Creates the database schema, the first administrator account and default settings.
// Usage: node --env-file=.env scripts/db-setup.mjs [--sample]
//   --sample  also inserts demo staff, incidents and service requests (only when the tables are empty)
import { randomBytes, scryptSync } from 'node:crypto'
import pg from 'pg'

const { Client } = pg
const withSample = process.argv.includes('--sample')

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

const schema = `
create table if not exists staff (
  id serial primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'Field inspector',
  district text not null default 'Central office',
  phone text,
  status text not null default 'Active',
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create sequence if not exists incident_ref_seq start 24100;
create table if not exists incidents (
  id serial primary key,
  ref text not null unique default ('AACEA-' || nextval('incident_ref_seq')),
  title text not null,
  category text not null,
  sub_city text not null,
  woreda text,
  landmark text,
  description text not null default '',
  status text not null default 'New',
  priority text not null default 'Medium',
  source text not null default 'Public portal',
  assignee_id integer references staff(id) on delete set null,
  reporter_name text,
  reporter_phone text,
  reporter_email text,
  anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists incidents_status_idx on incidents(status);
create index if not exists incidents_created_idx on incidents(created_at desc);

create table if not exists incident_notes (
  id serial primary key,
  incident_id integer not null references incidents(id) on delete cascade,
  staff_id integer references staff(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create sequence if not exists service_ref_seq start 120;
create table if not exists service_requests (
  id serial primary key,
  ref text not null unique default ('AACEA-S' || nextval('service_ref_seq')),
  title text not null,
  category text not null,
  sub_city text not null,
  status text not null default 'Received',
  assignee_id integer references staff(id) on delete set null,
  requester_name text,
  requester_phone text,
  notes text not null default '',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists notifications (
  id serial primary key,
  title text not null,
  body text not null default '',
  type text not null default 'info',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id serial primary key,
  staff_id integer references staff(id) on delete set null,
  action text not null,
  area text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on audit_log(created_at desc);

alter table staff add column if not exists must_change_password boolean not null default false;

create table if not exists roles (
  name text primary key,
  description text not null default '',
  permissions text[] not null default '{}',
  builtin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists email_log (
  id serial primary key,
  staff_id integer references staff(id) on delete set null,
  kind text not null,
  subject text not null,
  recipients text[] not null,
  failed text[] not null default '{}',
  attachments text[] not null default '{}',
  status text not null,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_created_idx on email_log(created_at desc);

-- GIS
alter table incidents add column if not exists lat double precision;
alter table incidents add column if not exists lng double precision;
alter table incidents add column if not exists location_source text;

create table if not exists staff_locations (
  staff_id integer primary key references staff(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  on_duty boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists checkins (
  id serial primary key,
  staff_id integer references staff(id) on delete set null,
  incident_id integer references incidents(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Revenue
create table if not exists fee_schedule (
  id serial primary key,
  code text not null unique,
  violation text not null,
  category text not null,
  description text not null default '',
  first_amount numeric(12,2) not null,
  repeat_amount numeric(12,2) not null,
  due_days integer not null default 30,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create sequence if not exists citation_ref_seq start 1001;
create table if not exists citations (
  id serial primary key,
  ref text not null unique default ('CIT-' || to_char(now(), 'YYYY') || '-' || nextval('citation_ref_seq')),
  incident_id integer references incidents(id) on delete set null,
  fee_id integer references fee_schedule(id) on delete set null,
  violation text not null,
  offender_name text not null,
  offender_id_no text,
  offender_phone text,
  offender_email text,
  offender_address text,
  repeat_offense boolean not null default false,
  amount numeric(12,2) not null,
  due_date date not null,
  status text not null default 'Unpaid',
  notes text not null default '',
  issued_by integer references staff(id) on delete set null,
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists citations_status_idx on citations(status);

create table if not exists payment_plans (
  id serial primary key,
  citation_id integer not null references citations(id) on delete cascade,
  installments integer not null,
  start_date date not null,
  status text not null default 'Active',
  approved_by integer references staff(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id serial primary key,
  citation_id integer not null references citations(id) on delete cascade,
  amount numeric(12,2) not null,
  method text not null,
  receipt_no text,
  reference text,
  status text not null default 'Confirmed',
  provider_tx_ref text unique,
  received_by integer references staff(id) on delete set null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Legal
create sequence if not exists legal_ref_seq start 101;
create table if not exists legal_cases (
  id serial primary key,
  ref text not null unique default ('LC-' || to_char(now(), 'YYYY') || '-' || nextval('legal_ref_seq')),
  type text not null,
  citation_id integer references citations(id) on delete set null,
  incident_id integer references incidents(id) on delete set null,
  status text not null default 'Open',
  appellant_name text,
  appellant_phone text,
  appellant_email text,
  reason text not null default '',
  outcome text,
  outcome_amount numeric(12,2),
  decision_notes text not null default '',
  decided_at timestamptz,
  created_by integer references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hearings (
  id serial primary key,
  legal_case_id integer not null references legal_cases(id) on delete cascade,
  scheduled_at timestamptz not null,
  location text not null,
  presiding text,
  status text not null default 'Scheduled',
  notes text not null default '',
  created_by integer references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists hearings_when_idx on hearings(scheduled_at);

-- Evidence (files stored on disk under storage/evidence, never in the web root)
create table if not exists evidence (
  id serial primary key,
  incident_id integer references incidents(id) on delete cascade,
  legal_case_id integer references legal_cases(id) on delete cascade,
  original_name text not null,
  stored_name text not null unique,
  mime text not null,
  size_bytes bigint not null,
  sha256 text not null,
  captured_at timestamptz,
  lat double precision,
  lng double precision,
  source text not null,
  description text not null default '',
  uploaded_by integer references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Public website
alter table service_requests add column if not exists requester_email text;
alter table service_requests add column if not exists source text not null default 'Staff';

create table if not exists public_documents (
  id serial primary key,
  title text not null,
  description text not null default '',
  original_name text not null,
  stored_name text not null unique,
  mime text not null,
  size_bytes bigint not null,
  sha256 text,
  published boolean not null default true,
  uploaded_by integer references staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);
`

const defaultSettings = {
  org_name: 'Addis Ababa Code Enforcement Authority',
  contact_email: 'operations@aacea.gov.et',
  response_target_hours: 48,
  default_district: 'All districts',
  notify_escalations: true,
  require_location: true,
  show_resolved: false,
  require_approval_close: true,
  pref_escalations: true,
  pref_assignments: true,
  pref_sla: true,
  email_sender_name: 'AACEA – Code Enforcement Authority',
  email_confirm_reporters: true,
  escalate_after_days: 30,
  appeal_window_days: 15,
  payment_instructions: 'Pay at any AACEA sub-city office or by bank transfer, quoting your citation number.',
  public_phone: '011 123 4567',
  public_email: 'support@aacea.gov.et',
  public_address: 'City Hall, Menelik II Avenue, Addis Ababa',
  office_hours: 'Monday–Friday, 8:30 AM – 5:30 PM',
}

// Keep in sync with lib/rbac.ts (DEFAULT_ROLES).
const V3 = ['map.view', 'field.use', 'evidence.view', 'evidence.upload', 'citations.view', 'citations.issue', 'citations.manage', 'payments.record', 'fees.manage', 'legal.view', 'legal.manage']
const ALL = [...V3, 'incidents.view', 'incidents.create', 'incidents.edit', 'incidents.bulk', 'incidents.close', 'incidents.delete', 'districts.view', 'services.view', 'services.edit', 'services.delete', 'team.view', 'team.reassign', 'reports.view', 'reports.export', 'audit.view', 'notifications.view', 'email.send', 'email.broadcast', 'users.manage', 'settings.manage']
const defaultRoles = [
  ['Administrator', 'Full access to every part of the workspace, including users and roles.', ALL],
  ['Supervisor', 'Runs operations: closes and reassigns cases, manages settings and broadcasts.', ALL.filter((p) => !['incidents.delete', 'users.manage'].includes(p))],
  ['Senior inspector', 'Works and triages cases across districts, exports and emails reports.', ['incidents.view', 'incidents.create', 'incidents.edit', 'incidents.bulk', 'districts.view', 'services.view', 'services.edit', 'team.view', 'reports.view', 'reports.export', 'notifications.view', 'email.send']],
  ['Case coordinator', 'Coordinates the queue and service requests, shares reports.', ['incidents.view', 'incidents.create', 'incidents.edit', 'incidents.bulk', 'districts.view', 'services.view', 'services.edit', 'team.view', 'reports.view', 'reports.export', 'notifications.view', 'email.send']],
  ['Field inspector', 'Handles assigned cases and service requests in the field.', ['incidents.view', 'incidents.create', 'incidents.edit', 'services.view', 'services.edit', 'notifications.view']],
]

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000)

async function seedSample(client, adminId) {
  const { rows: [{ count }] } = await client.query('select count(*)::int as count from incidents')
  if (count > 0) return console.log('• Sample data skipped (incidents already exist)')

  const staffPassword = hashPassword(randomBytes(12).toString('hex'))
  const people = [
    ['Dawit Alemu', 'dawit.alemu@aacea.gov.et', 'Senior inspector', 'Bole', 'Active'],
    ['Hana Tesfaye', 'hana.tesfaye@aacea.gov.et', 'Case coordinator', 'Kirkos', 'On leave'],
    ['Robel Girma', 'robel.girma@aacea.gov.et', 'Field inspector', 'Arada', 'Active'],
    ['Sara Tadesse', 'sara.tadesse@aacea.gov.et', 'Supervisor', 'Yeka', 'Active'],
  ]
  const staffIds = [adminId]
  for (const [name, email, role, district, status] of people) {
    const { rows } = await client.query(
      `insert into staff (name, email, password_hash, role, district, status) values ($1,$2,$3,$4,$5,$6)
       on conflict (email) do update set name = excluded.name returning id`,
      [name, email, staffPassword, role, district, status],
    )
    staffIds.push(rows[0].id)
  }

  const incidents = [
    ['Unpermitted construction', 'Illegal Construction', 'Bole', 'Woreda 03', 'Escalated', 'High', 52],
    ['Illegal street vending', 'Illegal Street Vending', 'Arada', 'Woreda 08', 'In progress', 'Medium', 31],
    ['Waste pollution near river bank', 'Illegal Waste Dumping / Sanitation', 'Kirkos', 'Woreda 05', 'New', 'Medium', 7],
    ['Blocked public walkway', 'Public Sidewalk Obstruction', 'Yeka', 'Woreda 11', 'Resolved', 'Low', 48],
    ['Unauthorized billboard', 'Unauthorized Billboard', 'Lideta', 'Woreda 02', 'In progress', 'Low', 72],
    ['Fence built on public land', 'Land Grabbing / Illegal Occupancy', 'Bole', 'Woreda 07', 'New', 'High', 3],
    ['Construction debris on road', 'Illegal Construction', 'Kirkos', 'Woreda 02', 'Resolved', 'Medium', 120],
    ['Market stalls blocking sidewalk', 'Public Sidewalk Obstruction', 'Addis Ketema', 'Woreda 04', 'Resolved', 'Medium', 200],
    ['Illegal dumping behind school', 'Illegal Waste Dumping / Sanitation', 'Gullele', 'Woreda 06', 'Escalated', 'High', 96],
    ['Extra floor added without permit', 'Illegal Construction', 'Nefas Silk Lafto', 'Woreda 10', 'In progress', 'High', 26],
    ['Vendors occupying bus stop', 'Illegal Street Vending', 'Kolfe Keranio', 'Woreda 01', 'New', 'Low', 12],
    ['Garbage burning in compound', 'Illegal Waste Dumping / Sanitation', 'Lemi Kura', 'Woreda 09', 'Resolved', 'Medium', 300],
    ['Shop extension onto walkway', 'Public Sidewalk Obstruction', 'Arada', 'Woreda 01', 'Resolved', 'Low', 400],
    ['Container placed on green area', 'Land Grabbing / Illegal Occupancy', 'Akaki Kality', 'Woreda 05', 'In progress', 'Medium', 60],
    ['Night-time construction noise', 'Illegal Construction', 'Bole', 'Woreda 12', 'Resolved', 'Low', 150],
    ['Sewage discharge to street', 'Illegal Waste Dumping / Sanitation', 'Yeka', 'Woreda 03', 'New', 'High', 2],
  ]
  for (const [i, [title, category, subCity, woreda, status, priority, age]] of incidents.entries()) {
    const created = hoursAgo(age)
    const assignee = status === 'New' ? null : staffIds[(i % (staffIds.length - 1)) + 1]
    const resolved = status === 'Resolved' ? new Date(created.getTime() + Math.min(age, 40) * 1800_000) : null
    const { rows } = await client.query(
      `insert into incidents (title, category, sub_city, woreda, landmark, description, status, priority, assignee_id, anonymous, reporter_name, created_at, updated_at, resolved_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13) returning id`,
      [title, category, subCity, woreda, `Near ${subCity} main road`, `${title} reported by a resident in ${subCity}, ${woreda}.`, status, priority, assignee, i % 3 === 0, i % 3 === 0 ? null : 'Resident', created, resolved],
    )
    if (assignee) await client.query('insert into incident_notes (incident_id, staff_id, body, created_at) values ($1,$2,$3,$4)', [rows[0].id, assignee, 'Site visit scheduled. Owner notified.', new Date(created.getTime() + 3600_000)])
  }

  const services = [
    ['Building permit review', 'Building permit review', 'Bole', 'In review', 0],
    ['Waste collection request', 'Waste collection', 'Kirkos', 'Assigned', 1],
    ['Street vendor registration', 'Street vendor registration', 'Arada', 'Received', 2],
    ['Public space booking – weekend market', 'Public space booking', 'Yeka', 'Closed', -3],
    ['Pre-opening inspection for restaurant', 'Inspection request', 'Lideta', 'Assigned', 4],
    ['Bulk waste pickup', 'Waste collection', 'Gullele', 'Received', 5],
  ]
  for (const [i, [title, category, subCity, status, dueIn]] of services.entries()) {
    await client.query(
      `insert into service_requests (title, category, sub_city, status, assignee_id, requester_name, due_date, created_at, closed_at)
       values ($1,$2,$3,$4,$5,$6, current_date + $7::int, $8, $9)`,
      [title, category, subCity, status, status === 'Received' ? null : staffIds[(i % (staffIds.length - 1)) + 1], 'Citizen applicant', dueIn, hoursAgo(24 * (i + 1)), status === 'Closed' ? hoursAgo(10) : null],
    )
  }

  await client.query(`insert into notifications (title, body, type, link, created_at) values
    ('Escalated case needs review', 'An escalated construction case in Bole has been open for over 48 hours.', 'urgent', '/admin/incidents?status=Escalated', now() - interval '12 minutes'),
    ('New reports awaiting assignment', 'New public reports are waiting in the incident queue.', 'assignment', '/admin/incidents?status=New', now() - interval '1 hour'),
    ('Monthly report available', 'This month''s performance report is ready to download.', 'info', '/admin/reports', now() - interval '1 day')`)
  await client.query(`insert into audit_log (staff_id, action, area, detail, created_at) values ($1, 'Loaded sample data', 'System', 'Demo staff, incidents and service requests created', now())`, [adminId])
  console.log('• Sample data inserted')
}

const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  await client.query('begin')
  await client.query(schema)
  console.log('• Schema ready')

  for (const [key, value] of Object.entries(defaultSettings)) {
    await client.query('insert into settings (key, value) values ($1, $2) on conflict (key) do nothing', [key, JSON.stringify(value)])
  }
  console.log('• Default settings ready')

  for (const [name, description, permissions] of defaultRoles) {
    await client.query('insert into roles (name, description, permissions, builtin) values ($1, $2, $3, true) on conflict (name) do nothing', [name, description, permissions])
  }
  // One-time: grant GIS / legal / revenue permissions to built-in roles without undoing later customisations.
  const v3Grants = {
    Supervisor: V3,
    'Senior inspector': ['map.view', 'field.use', 'evidence.view', 'evidence.upload', 'citations.view', 'citations.issue', 'legal.view'],
    'Case coordinator': ['map.view', 'evidence.view', 'evidence.upload', 'citations.view', 'citations.issue', 'payments.record', 'legal.view', 'legal.manage'],
    'Field inspector': ['field.use', 'evidence.view', 'evidence.upload', 'citations.view', 'citations.issue'],
  }
  const { rows: applied } = await client.query("select 1 from settings where key = 'rbac_v3_applied'")
  if (!applied.length) {
    for (const [role, perms] of Object.entries(v3Grants))
      await client.query('update roles set permissions = array(select distinct unnest(permissions || $2::text[])) where name = $1', [role, perms])
    await client.query("insert into settings (key, value) values ('rbac_v3_applied', 'true')")
  }
  // Administrators always keep every permission.
  await client.query("update roles set permissions = $1 where name = 'Administrator'", [ALL])
  console.log('• Roles & permissions ready')

  const email = (process.env.ADMIN_EMAIL || 'admin@aacea.gov.et').toLowerCase()
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe!2026'
  let { rows: [admin] } = await client.query('select id from staff where email = $1', [email])
  if (!admin) {
    ;({ rows: [admin] } = await client.query(
      `insert into staff (name, email, password_hash, role, district) values ('Marta Bekele', $1, $2, 'Administrator', 'Central office') returning id`,
      [email, hashPassword(password)],
    ))
    console.log(`• Administrator created: ${email} / ${password}  (change this password in Settings → My account)`)
  } else {
    console.log(`• Administrator exists: ${email}`)
  }

  // Sample fee schedule (placeholder amounts - replace with the official schedule).
  const fees = [
    ['IC-01', 'Construction without a permit', 'Illegal Construction', 25000, 50000, 30],
    ['IC-02', 'Building beyond approved plan', 'Illegal Construction', 15000, 30000, 30],
    ['LG-01', 'Illegal occupation of public land', 'Land Grabbing / Illegal Occupancy', 30000, 60000, 15],
    ['SO-01', 'Obstructing a public sidewalk', 'Public Sidewalk Obstruction', 2000, 5000, 15],
    ['WD-01', 'Illegal waste dumping', 'Illegal Waste Dumping / Sanitation', 5000, 10000, 15],
    ['SV-01', 'Unlicensed street vending', 'Illegal Street Vending', 1000, 2500, 15],
    ['BB-01', 'Unauthorized billboard or sign', 'Unauthorized Billboard', 8000, 16000, 30],
  ]
  for (const [code, violation, category, first, repeat, due] of fees)
    await client.query('insert into fee_schedule (code, violation, category, first_amount, repeat_amount, due_days, description) values ($1,$2,$3,$4,$5,$6,$7) on conflict (code) do nothing',
      [code, violation, category, first, repeat, due, 'Sample amount - replace with the official schedule'])
  console.log('• Fee schedule ready')

  // Cases without coordinates get an approximate point near their sub-city centre (marked as approximate).
  const centres = { Bole: [8.995, 38.79], Kirkos: [9.005, 38.76], Yeka: [9.04, 38.81], Lideta: [9.01, 38.735], Arada: [9.035, 38.752], 'Akaki Kality': [8.89, 38.78], 'Nefas Silk Lafto': [8.96, 38.735], 'Kolfe Keranio': [9.02, 38.695], Gullele: [9.06, 38.735], 'Addis Ketema': [9.03, 38.725], 'Lemi Kura': [9.02, 38.87] }
  const { rows: missing } = await client.query('select id, sub_city from incidents where lat is null')
  for (const row of missing) {
    const c = centres[row.sub_city]
    if (!c) continue
    await client.query("update incidents set lat = $2, lng = $3, location_source = 'Approximate (sub-city centre)' where id = $1", [row.id, c[0] + (Math.random() - 0.5) * 0.02, c[1] + (Math.random() - 0.5) * 0.02])
  }
  if (missing.length) console.log('• Approximate map points added to ' + missing.length + ' case(s)')

  if (withSample) await seedSample(client, admin.id)
  await client.query('commit')
  console.log('Database setup complete.')
} catch (error) {
  await client.query('rollback')
  console.error('Database setup failed:', error.message)
  process.exitCode = 1
} finally {
  await client.end()
}
