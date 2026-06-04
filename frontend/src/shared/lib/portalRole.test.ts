import { describe, it, expect } from 'vitest';
import { getCurrentPortalRole } from './portalRole';

describe('getCurrentPortalRole', () => {
  it.each([
    ['/superadmin/dashboard', 'super_admin'],
    ['/superadmin-login', 'super_admin'],
    ['/admin/directory', 'admin'],
    ['/admin-login', 'admin'],
    ['/teacher/dashboard', 'teacher'],
    ['/teacher-login', 'teacher'],
    ['/parent/dashboard', 'parent'],
    ['/parent-login', 'parent'],
    ['/', 'parent'],
    ['/anything-else', 'parent'],
  ])('maps %s -> %s', (path, role) => {
    expect(getCurrentPortalRole(path)).toBe(role);
  });

  it('treats super_admin paths as super_admin even though they contain "admin"', () => {
    // Guard against a substring-ordering regression where /superadmin
    // accidentally resolves to admin.
    expect(getCurrentPortalRole('/superadmin/schools-overview')).toBe('super_admin');
  });
});
