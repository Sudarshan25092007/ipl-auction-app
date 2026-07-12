-- Alter users table to allow NULL values in password_hash (for Google OAuth users)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
