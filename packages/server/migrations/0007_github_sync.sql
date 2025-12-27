-- Add GitHub sync columns to projects table
ALTER TABLE projects ADD COLUMN github_repo TEXT;
ALTER TABLE projects ADD COLUMN github_branch TEXT DEFAULT 'main';
ALTER TABLE projects ADD COLUMN github_path TEXT DEFAULT '';
