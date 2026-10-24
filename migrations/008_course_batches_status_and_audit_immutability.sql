-- Migration: 008_course_batches_status_and_audit_immutability.sql
-- Alignment with Section 11.2 and Section 17.2 of Course Platform Backend Plan
-- 1. Align course_batches.status with Section 11.2: ENUM('open', 'full', 'closed', 'completed') DEFAULT 'open'
-- 2. Enforce audit_logs database-level immutability via BEFORE UPDATE and BEFORE DELETE triggers

ALTER TABLE course_batches 
  MODIFY COLUMN status ENUM('open', 'full', 'closed', 'completed') NOT NULL DEFAULT 'open';

DROP TRIGGER IF EXISTS trg_audit_logs_no_update;

CREATE TRIGGER trg_audit_logs_no_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs entries are immutable and cannot be updated';

DROP TRIGGER IF EXISTS trg_audit_logs_no_delete;

CREATE TRIGGER trg_audit_logs_no_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs entries are immutable and cannot be deleted';
