-- Add 'document' value to media_asset_type enum for PDFs and other file attachments
ALTER TYPE media_asset_type ADD VALUE IF NOT EXISTS 'document';
