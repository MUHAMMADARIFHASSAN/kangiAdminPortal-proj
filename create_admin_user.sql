-- ============================================================
--  create_admin_user.sql
--  alisiyal2764@gmail.com ko admin banata hai
--  Supabase Dashboard → SQL Editor → New Query → RUN
-- ============================================================

-- Step 1: Email confirm karo (agar nahi hua)
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email = 'alisiyal2764@gmail.com'
  AND email_confirmed_at IS NULL;

-- Step 2: Profile row create/update with is_admin = true
INSERT INTO public.profiles (id, display_name, is_admin)
SELECT id, 'Ali Siyal', true
FROM auth.users
WHERE email = 'alisiyal2764@gmail.com'
ON CONFLICT (id) DO UPDATE
  SET is_admin     = true,
      display_name = 'Ali Siyal';

-- Step 3: Verify — yeh result dikhna chahiye:
-- email                   | email_confirmed | is_admin
-- alisiyal2764@gmail.com  | true            | true
SELECT
  u.email,
  (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
  p.is_admin,
  p.display_name
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'alisiyal2764@gmail.com';
