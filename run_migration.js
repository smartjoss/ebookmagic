/**
 * Script untuk menjalankan migrasi database (tambah RLS policies + fix trigger)
 * Jalankan sekali saja: node run_migration.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
    console.log('🔄 Menjalankan migrasi database...\n');

    const queries = [
        {
            name: 'Create Extension uuid-ossp',
            sql: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`
        },
        {
            name: 'Helper function: get_user_role',
            sql: `CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
                RETURNS TEXT AS $$
                BEGIN
                    RETURN (SELECT role FROM public.user_profiles WHERE id = user_id);
                END;
                $$ LANGUAGE plpgsql SECURITY DEFINER;`
        },
        {
            name: 'RLS Policy: Allow insert own profile',
            sql: `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow insert own profile' AND tablename = 'user_profiles') THEN
                    CREATE POLICY "Allow insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
                END IF;
            END $$;`
        },
        {
            name: 'RLS Policy: Users can update their own profile',
            sql: `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own profile' AND tablename = 'user_profiles') THEN
                    CREATE POLICY "Users can update their own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
                END IF;
            END $$;`
        },
        {
            name: 'RLS Policy: Owner can update all profiles',
            sql: `DO $$ BEGIN
                DROP POLICY IF EXISTS "Owner can update all profiles" ON user_profiles;
                CREATE POLICY "Owner can update all profiles" ON user_profiles FOR UPDATE USING (public.get_user_role(auth.uid()) = 'owner');
            END $$;`
        },
        {
            name: 'RLS Policy: Owner can delete profiles',
            sql: `DO $$ BEGIN
                DROP POLICY IF EXISTS "Owner can delete profiles" ON user_profiles;
                CREATE POLICY "Owner can delete profiles" ON user_profiles FOR DELETE USING (public.get_user_role(auth.uid()) = 'owner');
            END $$;`
        },
        {
            name: 'Update trigger: handle_new_user (tambah email)',
            sql: `CREATE OR REPLACE FUNCTION public.handle_new_user()
                RETURNS TRIGGER AS $$
                BEGIN
                    INSERT INTO public.user_profiles (id, email, role, quota_agency, quota_personal)
                    VALUES (new.id, new.email, 'free', 0, 0);
                    RETURN new;
                END;
                $$ LANGUAGE plpgsql SECURITY DEFINER;`
        }
    ];

    let success = 0;
    let failed = 0;

    for (const q of queries) {
        try {
            const { error } = await supabase.rpc('exec_sql', { sql: q.sql });
            if (error) {
                // Fallback: try using direct REST API
                const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                    },
                    body: JSON.stringify({ sql: q.sql })
                });
                if (!res.ok) throw error;
            }
            console.log(`  ✅ ${q.name}`);
            success++;
        } catch (err) {
            console.log(`  ❌ ${q.name}: ${err.message || err}`);
            failed++;
        }
    }

    console.log(`\n📊 Hasil: ${success} berhasil, ${failed} gagal`);
    
    if (failed > 0) {
        console.log('\n⚠️  Beberapa query gagal via RPC. Ini normal jika Supabase tidak punya fungsi exec_sql.');
        console.log('    Anda perlu menjalankan query di Supabase SQL Editor secara manual.');
        console.log('    Buka: https://supabase.com/dashboard/project/kjahnecvqyvxgylvgmla/sql/new');
        console.log('\n    Salin dan paste query berikut:\n');
        console.log('--- SALIN MULAI DARI BAWAH INI ---\n');
        console.log(`-- 1. Helper function
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT role FROM public.user_profiles WHERE id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Policy INSERT
CREATE POLICY "Allow insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 3. Policy UPDATE (self)
CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- 4. Policy UPDATE (owner)
DROP POLICY IF EXISTS "Owner can update all profiles" ON user_profiles;
CREATE POLICY "Owner can update all profiles" ON user_profiles
  FOR UPDATE USING (public.get_user_role(auth.uid()) = 'owner');

-- 5. Policy DELETE (owner)
DROP POLICY IF EXISTS "Owner can delete profiles" ON user_profiles;
CREATE POLICY "Owner can delete profiles" ON user_profiles
  FOR DELETE USING (public.get_user_role(auth.uid()) = 'owner');

-- 6. Fix trigger (tambah email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role, quota_agency, quota_personal)
  VALUES (new.id, new.email, 'free', 0, 0);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`);
        console.log('\n--- SALIN SAMPAI ATAS INI ---');
    }

    process.exit(0);
}

runMigration().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
