-- Migration: 004_batches_benefits_pricing_offers.sql
-- Tables: course_batches, course_benefits, course_enrollment_settings,
--         course_offers, course_installment_plans
-- Charset: utf8mb4, Engine: InnoDB

CREATE TABLE IF NOT EXISTS course_batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT UNSIGNED NOT NULL,
  batch_name VARCHAR(150) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  class_days VARCHAR(100) NULL,
  class_timing VARCHAR(100) NULL,
  total_seats INT NOT NULL DEFAULT 0,
  seats_available INT NOT NULL DEFAULT 0,
  enrollment_deadline DATE NULL,
  location VARCHAR(150) NULL,
  status ENUM('upcoming', 'ongoing', 'completed', 'cancelled') NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_batches_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  INDEX idx_course_batches_course (course_id),
  INDEX idx_course_batches_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_benefits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT UNSIGNED NOT NULL UNIQUE,
  certificate_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  certificate_type VARCHAR(100) NULL,
  career_support_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mock_interviews BOOLEAN NOT NULL DEFAULT FALSE,
  resume_support BOOLEAN NOT NULL DEFAULT FALSE,
  placement_assistance BOOLEAN NOT NULL DEFAULT FALSE,
  internship_support BOOLEAN NOT NULL DEFAULT FALSE,
  project_count INT NOT NULL DEFAULT 0,
  lifetime_access BOOLEAN NOT NULL DEFAULT FALSE,
  access_duration_days INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_benefits_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_enrollment_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT UNSIGNED NOT NULL UNIQUE,
  enrollment_limit INT NULL,
  enrollment_start_at DATETIME NULL,
  enrollment_end_at DATETIME NULL,
  drip_content_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_enrollment_settings_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_offers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT UNSIGNED NOT NULL,
  offer_name VARCHAR(150) NOT NULL,
  discount_type ENUM('percentage', 'fixed') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  coupon_code VARCHAR(50) NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  usage_limit INT NULL,
  usage_count INT NOT NULL DEFAULT 0,
  per_user_limit INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_offers_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  INDEX idx_course_offers_course (course_id),
  INDEX idx_course_offers_coupon (coupon_code),
  INDEX idx_course_offers_active_dates (is_active, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_installment_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT UNSIGNED NOT NULL,
  plan_name VARCHAR(100) NOT NULL,
  installment_count INT NOT NULL DEFAULT 2,
  installment_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  interval_days INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_installments_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  INDEX idx_course_installments_course (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
