-- Migration: Add marketing role to staff_role enum
ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'marketing';
