-- ============================================================
-- migrations/005_room_status_waiting_host_terminated.sql
-- Extend room status enum check to include 'waiting_host' and 'terminated'
-- ============================================================

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_status_check 
  CHECK (status IN ('lobby', 'active', 'completed', 'waiting_host', 'terminated'));

CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
