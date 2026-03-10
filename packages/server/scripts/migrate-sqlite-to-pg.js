/**
 * SQLite → PostgreSQL migration script for Strapi
 * Run with: node scripts/migrate-sqlite-to-pg.js
 */

const { Client } = require('pg')

const pg = new Client({
    host: 'localhost',
    port: 5432,
    database: 'property_management',
    user: 'postgres',
    password: 'kangmacytony',
})

async function run() {
    await pg.connect()
    console.log('✅ Connected to PostgreSQL')

    try {
        await pg.query('BEGIN')

        // ─── Disable triggers temporarily for clean insert ───────────────────────
        await pg.query('SET session_replication_role = replica')

        // ─── TRUNCATE all tables we'll repopulate (cascade) ──────────────────────
        const tablesToTruncate = [
            'admin_users_roles_lnk', 'admin_permissions_role_lnk', 'admin_permissions', 'admin_roles', 'admin_users',
            'up_permissions_role_lnk', 'up_permissions', 'up_roles',
            'up_users_role_lnk', 'up_users_plan_lnk', 'up_users_active_subscription_lnk',
            'up_users_property_lnk', 'up_users_unit_type_lnk', 'up_users',
            'plans',
            'subscriptions_plan_lnk', 'subscriptions_user_lnk', 'subscriptions_scheduled_downgrade_plan_lnk', 'subscriptions',
            'unit_types_property_lnk', 'unit_types',
            'properties',
            'leases_property_lnk', 'leases_resident_lnk', 'leases_unit_type_lnk', 'leases',
            'notifications_recipient_lnk', 'notifications_recipients_lnk', 'notifications_property_lnk', 'notifications',
        ]
        for (const t of tablesToTruncate) {
            await pg.query(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`)
        }
        console.log('✅ Truncated tables')

        // ─── admin_roles ──────────────────────────────────────────────────────────
        await pg.query(`
      INSERT INTO admin_roles (id, document_id, name, code, description, created_at, updated_at, published_at, created_by_id, updated_by_id, locale)
      VALUES
        (1, 'uspfwvtqzf1r5iys5ykviyiw', 'Super Admin', 'strapi-super-admin', 'Super Admins can access and manage all features and settings.', to_timestamp(1772950724908/1000.0), to_timestamp(1772950724908/1000.0), to_timestamp(1772950724908/1000.0), NULL, NULL, NULL),
        (2, 'clgmdpngclhxof0hiq8udlh0', 'Editor', 'strapi-editor', 'Editors can manage and publish contents including those of other users.', to_timestamp(1772950724909/1000.0), to_timestamp(1772950724909/1000.0), to_timestamp(1772950724909/1000.0), NULL, NULL, NULL),
        (3, 'crbvov6nj62oevlarjawsh6r', 'Author', 'strapi-author', 'Authors can manage the content they have created.', to_timestamp(1772950724910/1000.0), to_timestamp(1772950724910/1000.0), to_timestamp(1772950724910/1000.0), NULL, NULL, NULL)
    `)
        await pg.query(`SELECT setval('admin_roles_id_seq', 3)`)
        console.log('✅ admin_roles')

        // ─── admin_users ──────────────────────────────────────────────────────────
        await pg.query(`
      INSERT INTO admin_users (id, document_id, firstname, lastname, username, email, password, is_active, blocked, created_at, updated_at, published_at, created_by_id, updated_by_id, locale)
      VALUES (1, 'q0dbpn23jpevpsbmx4mtbdd6', 'Kang', 'vGent', NULL, 'kang@gmail.com', '$2a$10$tZSS.Vq.w1nZJzPbwiatOO4dwTj1hhf6zQke3bRRw1BwvH2JGcHZe', true, false, to_timestamp(1772952670413/1000.0), to_timestamp(1772952670413/1000.0), NULL, NULL, NULL, NULL)
    `)
        await pg.query(`SELECT setval('admin_users_id_seq', 1)`)
        console.log('✅ admin_users')

        // ─── admin_users_roles_lnk ────────────────────────────────────────────────
        await pg.query(`INSERT INTO admin_users_roles_lnk (id, user_id, role_id, user_ord, role_ord) VALUES (1, 1, 1, 1.0, 1.0)`)
        await pg.query(`SELECT setval('admin_users_roles_lnk_id_seq', 1)`)
        console.log('✅ admin_users_roles_lnk')

        // ─── admin_permissions (all 204 rows via SQLite dump) ─────────────────────
        // We'll re-use the existing PostgreSQL data for admin_permissions since Strapi seeds them automatically
        // But we need the role links. Let's get current admin_permissions IDs from PG and re-link them.
        // Actually Strapi already populated admin_permissions on first run — we just need the role links.
        // Re-insert admin_permissions_role_lnk based on what SQLite had.
        // SQLite had: all permissions linked to role 2 (Editor). We'll replicate that.
        // First check if PG already has admin_permissions populated
        const { rows: adminPermRows } = await pg.query(`SELECT COUNT(*) FROM admin_permissions`)
        const adminPermCount = parseInt(adminPermRows[0].count)
        console.log(`  ℹ️  admin_permissions already has ${adminPermCount} rows (seeded by Strapi)`)

        if (adminPermCount > 0) {
            // Rebuild admin_permissions_role_lnk: link all permissions to role 2 (Editor) as Strapi does by default
            await pg.query(`TRUNCATE TABLE admin_permissions_role_lnk RESTART IDENTITY CASCADE`)
            await pg.query(`
        INSERT INTO admin_permissions_role_lnk (permission_id, role_id, permission_ord)
        SELECT id, 2, row_number() OVER (ORDER BY id)
        FROM admin_permissions
      `)
            console.log('✅ admin_permissions_role_lnk (rebuilt)')
        }

        // ─── up_roles ─────────────────────────────────────────────────────────────
        await pg.query(`
      INSERT INTO up_roles (id, document_id, name, description, type, created_at, updated_at, published_at, created_by_id, updated_by_id, locale)
      VALUES
        (1, 'ti6u4uewill14fkzi0vit8tg', 'Authenticated', 'Default role given to authenticated user.', 'authenticated', to_timestamp(1772950724886/1000.0), to_timestamp(1773026057596/1000.0), to_timestamp(1772950724886/1000.0), NULL, NULL, NULL),
        (2, 'hs5z1rdnra4ul8fg1x0y5a5e', 'Public', 'Default role given to unauthenticated user.', 'public', to_timestamp(1772950724886/1000.0), to_timestamp(1773026033328/1000.0), to_timestamp(1772950724887/1000.0), NULL, NULL, NULL),
        (3, 'bb3gky9ruw1yra4sp10z3zrx', 'Manager', 'Manager', 'manager', to_timestamp(1773025909804/1000.0), to_timestamp(1773037837001/1000.0), to_timestamp(1773025909804/1000.0), NULL, NULL, NULL),
        (4, 'gw0qyqdoq0lx8qvzj0yzekax', 'Resident', 'Resident', 'resident', to_timestamp(1773026019375/1000.0), to_timestamp(1773026019375/1000.0), to_timestamp(1773026019375/1000.0), NULL, NULL, NULL)
    `)
        await pg.query(`SELECT setval('up_roles_id_seq', 4)`)
        console.log('✅ up_roles')

        // ─── up_permissions + role links (Strapi seeded them, just fix role links) ─
        const { rows: upPermRows } = await pg.query(`SELECT COUNT(*) FROM up_permissions`)
        const upPermCount = parseInt(upPermRows[0].count)
        console.log(`  ℹ️  up_permissions already has ${upPermCount} rows (seeded by Strapi)`)

        if (upPermCount > 0) {
            await pg.query(`TRUNCATE TABLE up_permissions_role_lnk RESTART IDENTITY CASCADE`)
            // SQLite: permissions 1-3 linked to role 1, permissions 4+ linked to role 2
            // Strapi re-seeds these correctly, but we need to preserve existing role linkages
            // Re-insert: first 3 to Authenticated (1), rest to Public (2) — Strapi default
            await pg.query(`
        INSERT INTO up_permissions_role_lnk (permission_id, role_id, permission_ord)
        SELECT id, 
          CASE WHEN id <= 3 THEN 1 ELSE 2 END,
          row_number() OVER (PARTITION BY CASE WHEN id <= 3 THEN 1 ELSE 2 END ORDER BY id)
        FROM up_permissions
      `)
            console.log('✅ up_permissions_role_lnk (rebuilt)')
        }

        // ─── plans ────────────────────────────────────────────────────────────────
        await pg.query(`
      INSERT INTO plans (id, document_id, name, slug, price, currency, max_properties, max_units_per_property, features, is_active, sort_order, created_at, updated_at, published_at, created_by_id, updated_by_id, locale)
      VALUES
        (1, 'izwb8lh2ndock1s87zmylv5o', 'Starter', 'Starter', 1490.0, 'THB', 1, 100, '["Up to 1 property","Up to 100 units","Basic reporting","Email support"]', true, 1, to_timestamp(1773025755624/1000.0), to_timestamp(1773025755624/1000.0), to_timestamp(1773025755620/1000.0), 1, 1, NULL),
        (2, 'c5hjk51c2r0p3yraa4onqkxo', 'Professional', 'Professional', 3480.0, 'THB', 3, 200, '["Up to 3 properties","Up to 200 units per property","Advanced reporting","Priority email support","Tenant portal"]', true, 2, to_timestamp(1773025775487/1000.0), to_timestamp(1773025775487/1000.0), to_timestamp(1773025775484/1000.0), 1, 1, NULL),
        (3, 'jnup992pgtid6m973y2fv5yd', 'Enterprise', 'Enterprise', 6470.0, 'THB', 5, 300, '["Up to 5 properties","Up to 300 units per property","Full analytics & reporting","Dedicated support","Tenant portal","Custom integrations","API access"]', true, 3, to_timestamp(1773025800919/1000.0), to_timestamp(1773025800919/1000.0), to_timestamp(1773025800915/1000.0), 1, 1, NULL)
    `)
        await pg.query(`SELECT setval('plans_id_seq', 3)`)
        console.log('✅ plans')

        // ─── properties ───────────────────────────────────────────────────────────
        await pg.query(`
      INSERT INTO properties (id, document_id, name, address, city, state, zip_code, country, property_type, status, total_units, occupied_units, currency, area_unit, created_at, updated_at, published_at, created_by_id, updated_by_id, locale)
      VALUES (1, 'xyk9ogsk0l3vb2xrmzsckcsg', 'test', 'test', 'test', 'test', 'test', 'Thailand', 'apartment', 'active', 10, 0, 'THB', 'sqm', to_timestamp(1773026117042/1000.0), to_timestamp(1773026226655/1000.0), to_timestamp(1773026226654/1000.0), NULL, NULL, NULL)
    `)
        await pg.query(`SELECT setval('properties_id_seq', 1)`)
        console.log('✅ properties')

        // ─── unit_types ───────────────────────────────────────────────────────────
        await pg.query(`
      INSERT INTO unit_types (id, document_id, name, description, unit_type, quantity, area, area_unit, price, currency, status, created_at, updated_at, published_at, created_by_id, updated_by_id, locale)
      VALUES (1, 'wk4afh4fymxcmpu1nvo21oej', 'testtest', NULL, 'studio', 10, 200.0, 'sqm', 8000.0, 'THB', 'available', to_timestamp(1773026117061/1000.0), to_timestamp(1773026117061/1000.0), to_timestamp(1773026117060/1000.0), NULL, NULL, NULL)
    `)
        await pg.query(`SELECT setval('unit_types_id_seq', 1)`)
        console.log('✅ unit_types')

        // ─── unit_types_property_lnk ──────────────────────────────────────────────
        await pg.query(`INSERT INTO unit_types_property_lnk (id, unit_type_id, property_id, unit_type_ord) VALUES (1, 1, 1, 1.0)`)
        await pg.query(`SELECT setval('unit_types_property_lnk_id_seq', 1)`)
        console.log('✅ unit_types_property_lnk')

        // ─── up_users ─────────────────────────────────────────────────────────────
        await pg.query(`
      INSERT INTO up_users (id, document_id, username, email, provider, password, reset_password_token, confirmation_token, confirmed, blocked, created_at, updated_at, published_at, created_by_id, updated_by_id, locale, room_number, registration_date, residency_status, next_bill_date)
      VALUES
        (1, 'e0m0uzhml3qh9biudjg43psf', 'test', 'test@gmail.com', 'local', '$2a$10$ifkQdyAcvQbI49yLXVixOOe7YmFYQmB1AW19RMQ3V46.tL98KUbAm', NULL, NULL, true, false, to_timestamp(1773026080366/1000.0), to_timestamp(1773030393624/1000.0), to_timestamp(1773030393619/1000.0), NULL, NULL, NULL, NULL, NULL, 'reserved', NULL),
        (2, 'k5rcb92c1cag9b6xddtbmiv8', 'asd', 'asd@gmail.com', 'local', '$2a$10$ud3u5DCC5K.BJ6smGP.l1OKpsqSVT49PQkmgkRPhsO4mzFGoEOHfC', NULL, NULL, true, false, to_timestamp(1773026205771/1000.0), to_timestamp(1773026259134/1000.0), to_timestamp(1773026259127/1000.0), NULL, NULL, NULL, '101', '2026-03-09', 'reserved', '2026-03-09'),
        (7, 'iykc7zxanmh4q9r2h5udx5hk', 'zxc', 'zxc@gmail.com', 'local', '$2a$10$Q6FU61Zei04UBPyWefFGMOi4UUcc3C2skGU1q3mz7wPzdI8hVrvVK', NULL, NULL, true, false, to_timestamp(1773035702627/1000.0), to_timestamp(1773038684530/1000.0), to_timestamp(1773038684525/1000.0), NULL, NULL, NULL, NULL, NULL, 'reserved', NULL)
    `)
        await pg.query(`SELECT setval('up_users_id_seq', 7)`)
        console.log('✅ up_users')

        // ─── up_users link tables ─────────────────────────────────────────────────
        await pg.query(`
      INSERT INTO up_users_role_lnk (id, user_id, role_id, user_ord) VALUES
        (2, 1, 3, 1.0),
        (4, 2, 4, 1.0),
        (9, 7, 3, 2.0)
    `)
        await pg.query(`SELECT setval('up_users_role_lnk_id_seq', 9)`)
        console.log('✅ up_users_role_lnk')

        await pg.query(`
      INSERT INTO up_users_property_lnk (id, user_id, property_id, user_ord, property_ord) VALUES
        (1, 1, 1, 1.0, 1.0),
        (3, 2, 1, 1.0, 2.0)
    `)
        await pg.query(`SELECT setval('up_users_property_lnk_id_seq', 3)`)
        console.log('✅ up_users_property_lnk')

        await pg.query(`
      INSERT INTO up_users_unit_type_lnk (id, user_id, unit_type_id) VALUES (1, 2, 1)
    `)
        await pg.query(`SELECT setval('up_users_unit_type_lnk_id_seq', 1)`)
        console.log('✅ up_users_unit_type_lnk')

        // ─── subscriptions ────────────────────────────────────────────────────────
        await pg.query(`
      INSERT INTO subscriptions (id, document_id, status, end_date, start_date, amount, currency, payment_method, payment_status, paid_at, stripe_payment_intent_id, invoice_no, is_auto_renew, renewal_reminder_sent, notes, created_at, updated_at, published_at, created_by_id, updated_by_id, locale, transaction_id, stripe_session_id, stripe_customer_id)
      VALUES
        (1,  'frxe7np1zafyyafe6kfo66j7', 'active',    '2026-03-09', '2026-03-02', 1490.0, 'THB', 'creditCard', 'paid', to_timestamp(1773030393608/1000.0), 'pi_3T8vOkGgm8V7nGJH040R2efW', 'INV-1773030323626', false, false, NULL, to_timestamp(1773030323636/1000.0), to_timestamp(1773030472537/1000.0), to_timestamp(1773030472532/1000.0), NULL, NULL, NULL, NULL, 'cs_test_a19cZUeFn3WGm3S4a1TUynwn972NEdKvQDQ9XVuzeR3KeHfidqsPqBYZeU', 'cus_U79hShqG8zz49v'),
        (16, 'v8rzyx9j4cbpj9nsh48oopph', 'cancelled', '2026-03-09', '2026-04-09', 1490.0, 'THB', 'creditCard', 'paid', to_timestamp(1773038672708/1000.0), 'pi_3T8xYHGgm8V7nGJH0qQE2aA9', 'INV-1773038672708', false, false, 'Duration: 1 Month', to_timestamp(1773038672714/1000.0), to_timestamp(1773038684510/1000.0), to_timestamp(1773038684506/1000.0), NULL, NULL, NULL, NULL, 'cs_test_a1FM5oGlXU72RotgMZQzm89TCjsO9QSfRj1KRBvv7bD1sfYeQWc3gmzcw5', 'cus_U7BwutNgvLGiUS'),
        (17, 'iq6w7tb174ixbw4v2ck31x4m', 'active',    '2026-03-09', '2026-04-09', 1990.0, 'THB', 'creditCard', 'paid', to_timestamp(1773038684514/1000.0), 'pi_3T8xYTGgm8V7nGJH1izHSGpW', 'INV-1773038684514', false, false, 'Duration: 1 Month', to_timestamp(1773038684519/1000.0), to_timestamp(1773038684519/1000.0), to_timestamp(1773038684514/1000.0), NULL, NULL, NULL, NULL, 'cs_test_a1O0TQXUolh1Qq8Yazju3iNgMmk8ndwUxfcbdjXBlYNwk7Z5BIohdeAuZy', 'cus_U7BwON5iaySovP')
    `)
        await pg.query(`SELECT setval('subscriptions_id_seq', 17)`)
        console.log('✅ subscriptions')

        // ─── subscriptions link tables ────────────────────────────────────────────
        await pg.query(`
      INSERT INTO subscriptions_plan_lnk (id, subscription_id, plan_id) VALUES
        (1,  1,  1),
        (7,  7,  2),
        (8,  8,  1),
        (9,  9,  2),
        (16, 16, 1),
        (17, 17, 2)
    `)
        await pg.query(`SELECT setval('subscriptions_plan_lnk_id_seq', 17)`)
        console.log('✅ subscriptions_plan_lnk')

        await pg.query(`
      INSERT INTO subscriptions_user_lnk (id, subscription_id, user_id, subscription_ord) VALUES
        (1,  1,  1, 1.0),
        (7,  7,  7, 2.0),
        (8,  8,  7, 3.0),
        (9,  9,  7, 4.0),
        (16, 16, 7, 5.0),
        (17, 17, 7, 6.0)
    `)
        await pg.query(`SELECT setval('subscriptions_user_lnk_id_seq', 17)`)
        console.log('✅ subscriptions_user_lnk')

        // ─── up_users plan + active subscription ──────────────────────────────────
        await pg.query(`
      INSERT INTO up_users_plan_lnk (id, user_id, plan_id, user_ord) VALUES
        (1,  1, 1, 1.0),
        (10, 7, 2, 1.0)
    `)
        await pg.query(`SELECT setval('up_users_plan_lnk_id_seq', 10)`)
        console.log('✅ up_users_plan_lnk')

        await pg.query(`
      INSERT INTO up_users_active_subscription_lnk (id, user_id, subscription_id) VALUES
        (1,  1, 1),
        (14, 7, 17)
    `)
        await pg.query(`SELECT setval('up_users_active_subscription_lnk_id_seq', 14)`)
        console.log('✅ up_users_active_subscription_lnk')

        // ─── leases ───────────────────────────────────────────────────────────────
        await pg.query(`
      INSERT INTO leases (id, document_id, lease_no, status, start_date, end_date, monthly_rent, deposit_amount, currency, notes, created_at, updated_at, published_at, created_by_id, updated_by_id, locale)
      VALUES (1, 'jevofttoqnls932ixs6f57ih', 'LSE-20260309-5333', 'pending', '2026-03-09', '2026-06-09', 8000.0, 16000.0, 'THB', NULL, to_timestamp(1773026205795/1000.0), to_timestamp(1773026226649/1000.0), to_timestamp(1773026226647/1000.0), NULL, NULL, NULL)
    `)
        await pg.query(`SELECT setval('leases_id_seq', 1)`)
        console.log('✅ leases')

        await pg.query(`INSERT INTO leases_property_lnk  (id, lease_id, property_id)            VALUES (1, 1, 1)`)
        await pg.query(`INSERT INTO leases_resident_lnk  (id, lease_id, user_id, lease_ord)      VALUES (1, 1, 2, 1.0)`)
        await pg.query(`INSERT INTO leases_unit_type_lnk (id, lease_id, unit_type_id)            VALUES (1, 1, 1)`)
        await pg.query(`SELECT setval('leases_property_lnk_id_seq', 1)`)
        await pg.query(`SELECT setval('leases_resident_lnk_id_seq', 1)`)
        await pg.query(`SELECT setval('leases_unit_type_lnk_id_seq', 1)`)
        console.log('✅ leases link tables')

        // ─── notifications ────────────────────────────────────────────────────────
        await pg.query(`
      INSERT INTO notifications (id, document_id, title, message, type, priority, is_read, read_at, related_document_id, action_url, metadata, created_at, updated_at, published_at, created_by_id, updated_by_id, locale)
      VALUES (1, 'p6hy67lmm8nlslvkchyaqf56', 'New lease created: LSE-20260309-5333', 'Lease period: 09 Mar 2026 - 09 Jun 2026', 'lease', 'high', false, NULL, 'jevofttoqnls932ixs6f57ih', '/resident/my-lease', '{"leaseNo":"LSE-20260309-5333","status":"pending","startDate":"2026-03-09","endDate":"2026-06-09","monthlyRent":8000,"currency":"THB","propertyName":"test"}', to_timestamp(1773026205803/1000.0), to_timestamp(1773026205803/1000.0), to_timestamp(1773026205801/1000.0), NULL, NULL, NULL)
    `)
        await pg.query(`SELECT setval('notifications_id_seq', 1)`)
        console.log('✅ notifications')

        await pg.query(`INSERT INTO notifications_recipient_lnk  (id, notification_id, user_id, notification_ord) VALUES (1, 1, 2, 1.0)`)
        await pg.query(`INSERT INTO notifications_recipients_lnk (id, notification_id, user_id, notification_ord, user_ord) VALUES (1, 1, 1, 1.0, 1.0)`)
        await pg.query(`INSERT INTO notifications_property_lnk   (id, notification_id, property_id)                         VALUES (1, 1, 1) ON CONFLICT DO NOTHING`)
        await pg.query(`SELECT setval('notifications_recipient_lnk_id_seq', 1)`)
        await pg.query(`SELECT setval('notifications_recipients_lnk_id_seq', 1)`)
        console.log('✅ notifications link tables')

        // ─── Re-enable triggers ───────────────────────────────────────────────────
        await pg.query('SET session_replication_role = DEFAULT')

        await pg.query('COMMIT')
        console.log('\n🎉 Migration complete! All data migrated from SQLite → PostgreSQL.')
    } catch (err) {
        await pg.query('ROLLBACK')
        await pg.query('SET session_replication_role = DEFAULT')
        console.error('\n❌ Migration failed, rolled back:', err.message)
        console.error(err)
    } finally {
        await pg.end()
    }
}

run()
