-- Run this script in the Supabase SQL Editor to create the necessary tables

CREATE TABLE IF NOT EXISTS ebooks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  niche TEXT,
  outline JSONB DEFAULT '[]'::jsonb,
  chapters JSONB DEFAULT '{}'::jsonb,
  canvas_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Setup Row Level Security (Optional but recommended)
ALTER TABLE ebooks ENABLE ROW LEVEL SECURITY;

-- Allow users to see only their own ebooks
CREATE POLICY "Users can view their own ebooks" ON ebooks
  FOR SELECT USING (auth.uid() = user_id);

-- Allow users to insert their own ebooks
CREATE POLICY "Users can insert their own ebooks" ON ebooks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own ebooks
CREATE POLICY "Users can update their own ebooks" ON ebooks
  FOR UPDATE USING (auth.uid() = user_id);

-- ==========================================================
-- AGENCY SYSTEM TABLES & FUNCTIONS
-- ==========================================================

-- 1. Table user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'free', -- 'owner', 'super_agency', 'agency', 'personal', 'free'
  parent_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  quota_agency INT DEFAULT 0,
  quota_personal INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON user_profiles 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can view children profiles" ON user_profiles 
  FOR SELECT USING (parent_id = auth.uid());

CREATE POLICY "Owner can view all profiles" ON user_profiles
  FOR SELECT USING ( (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'owner' );

-- 2. Trigger to create user_profiles automatically on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, role, quota_agency, quota_personal)
  VALUES (new.id, 'free', 0, 0);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to prevent error on re-run
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 3. RPC to assign role and deduct quota (runs as SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION assign_agency_user(
  creator_id UUID,
  new_user_id UUID,
  new_role TEXT,
  cost_agency INT,
  cost_personal INT
) RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_quota_agency INT;
  v_quota_personal INT;
BEGIN
  -- Get creator info
  SELECT role, quota_agency, quota_personal INTO v_role, v_quota_agency, v_quota_personal
  FROM user_profiles WHERE id = creator_id;

  -- Verify permissions
  IF v_role = 'owner' THEN
    -- owner can do anything, no quota needed
    cost_agency := 0;
    cost_personal := 0;
  ELSIF v_role = 'super_agency' THEN
    IF new_role = 'super_agency' THEN
      RAISE EXCEPTION 'Super Agency cannot create another Super Agency';
    END IF;
    IF new_role = 'agency' AND v_quota_agency < cost_agency THEN
      RAISE EXCEPTION 'Not enough agency quota';
    END IF;
    IF new_role = 'personal' AND v_quota_personal < cost_personal THEN
      RAISE EXCEPTION 'Not enough personal quota';
    END IF;
  ELSIF v_role = 'agency' THEN
    IF new_role != 'personal' THEN
      RAISE EXCEPTION 'Agency can only create personal accounts';
    END IF;
    IF v_quota_personal < cost_personal THEN
      RAISE EXCEPTION 'Not enough personal quota';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  -- Update creator quota
  UPDATE user_profiles 
  SET quota_agency = quota_agency - cost_agency,
      quota_personal = quota_personal - cost_personal
  WHERE id = creator_id;

  -- Update new user profile
  UPDATE user_profiles
  SET role = new_role, parent_id = creator_id
  WHERE id = new_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
