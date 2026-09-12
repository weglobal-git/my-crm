import test from 'node:test';
import assert from 'node:assert/strict';
import { canUserAccessChannel, sanitizePresenceUserInfo, type PusherAuthUser } from './pusher-auth-authorizer';
import { sanitizeNotificationPayload } from './notification-dispatcher';

test.describe('Pusher Security & DTO Sanitization (Phase P0-A & P2)', () => {
  const adminUser: PusherAuthUser = {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@company.com',
    image: 'https://example.com/admin.png',
    role: 'ADMIN',
  };

  const salesUserWithContacts: PusherAuthUser = {
    id: 'sales-1',
    name: 'Sales Rep',
    email: 'sales@company.com',
    image: 'https://example.com/sales.png',
    role: 'GENERAL',
    visibleMenuKeys: ['pipeline', 'contact', 'contact.contact'],
  };

  const restrictedUserWithoutContacts: PusherAuthUser = {
    id: 'restricted-1',
    name: 'Restricted Staff',
    email: 'restricted@company.com',
    image: null,
    role: 'GENERAL',
    visibleMenuKeys: ['pipeline'],
  };

  const externalUser: PusherAuthUser = {
    id: 'guest-1',
    name: 'Guest User',
    email: 'guest@external.com',
    role: 'GUEST',
  };

  test('canUserAccessChannel: Admin is authorized for contacts, pipeline, own user, and presence-global', () => {
    assert.equal(canUserAccessChannel(adminUser, 'private-user-admin-1'), true);
    assert.equal(canUserAccessChannel(adminUser, 'private-pipeline-admin-1'), true);
    assert.equal(canUserAccessChannel(adminUser, 'private-calendar-admin-1'), true);
    assert.equal(canUserAccessChannel(adminUser, 'private-contacts'), true);
    assert.equal(canUserAccessChannel(adminUser, 'presence-global'), true);

    // Admin cannot eavesdrop on other user's private channel
    assert.equal(canUserAccessChannel(adminUser, 'private-user-other-user'), false);
    assert.equal(canUserAccessChannel(adminUser, 'private-calendar-other-user'), false);
    // Non-allowlisted presence channel is rejected
    assert.equal(canUserAccessChannel(adminUser, 'presence-secret-room'), false);
    // Public channels are rejected
    assert.equal(canUserAccessChannel(adminUser, 'contact'), false);
  });

  test('canUserAccessChannel: User with contact menu permission is authorized for private-contacts', () => {
    assert.equal(canUserAccessChannel(salesUserWithContacts, 'private-contacts'), true);
    assert.equal(canUserAccessChannel(salesUserWithContacts, 'private-user-sales-1'), true);
    assert.equal(canUserAccessChannel(salesUserWithContacts, 'private-pipeline-sales-1'), true);
  });

  test('canUserAccessChannel: User WITHOUT contact permission is strictly FORBIDDEN from private-contacts', () => {
    assert.equal(canUserAccessChannel(restrictedUserWithoutContacts, 'private-contacts'), false);
    assert.equal(canUserAccessChannel(restrictedUserWithoutContacts, 'private-user-restricted-1'), true);
  });

  test('canUserAccessChannel: GUEST role is forbidden from pipeline channel', () => {
    assert.equal(canUserAccessChannel(externalUser, 'private-pipeline-guest-1'), false);
    assert.equal(canUserAccessChannel({ ...externalUser, visibleMenuKeys: ['calendar'] }, 'private-calendar-guest-1'), false);
  });

  test('canUserAccessChannel: Calendar requires own channel and calendar menu permission', () => {
    assert.equal(canUserAccessChannel({ ...salesUserWithContacts, visibleMenuKeys: ['calendar'] }, 'private-calendar-sales-1'), true);
    assert.equal(canUserAccessChannel(salesUserWithContacts, 'private-calendar-sales-1'), false);
    assert.equal(canUserAccessChannel({ ...salesUserWithContacts, visibleMenuKeys: ['calendar'] }, 'private-calendar-other'), false);
  });

  test('sanitizePresenceUserInfo: strips email and internal fields from presence payload', () => {
    const rawUser: PusherAuthUser & { password?: string; token?: string } = {
      id: 'usr-1',
      name: 'Agent Smith',
      email: 'secret@company.com',
      image: 'https://example.com/avatar.png',
      role: 'GENERAL',
      password: 'hashed-secret-value',
      token: 'bearer-secret-token',
    };

    const sanitized = sanitizePresenceUserInfo(rawUser);

    assert.equal((sanitized as Record<string, unknown>).email, undefined);
    assert.equal((sanitized as Record<string, unknown>).password, undefined);
    assert.equal((sanitized as Record<string, unknown>).token, undefined);
    assert.equal(sanitized.name, 'Agent Smith');
    assert.equal(sanitized.role, 'GENERAL');
    assert.equal(sanitized.image, 'https://example.com/avatar.png');
  });

  test('sanitizeNotificationPayload: strips sensitive Prisma sender attributes and normalizes DTO', () => {
    const rawDbNotification = {
      id: 'notif-101',
      recipientId: 'user-recipient-1',
      senderId: 'user-sender-1',
      type: 'DEAL_TRANSFER_REQUEST',
      title: 'Deal Transfer Request',
      message: 'requests to transfer deal to you.',
      referenceId: 'deal-xyz',
      status: 'PENDING',
      readAt: null,
      createdAt: new Date('2026-09-10T12:00:00Z'),
      sender: {
        id: 'user-sender-1',
        name: 'Manager Alice',
        email: 'alice@internal.corp',
        password: 'hashed-password-secret',
        image: 'https://image.com/alice.jpg',
        role: 'MANAGEMENT',
        resetToken: 'sensitive-token',
        createdAt: new Date(),
      },
    };

    const sanitized = sanitizeNotificationPayload(rawDbNotification);

    assert.equal(sanitized.id, 'notif-101');
    assert.equal(sanitized.recipientId, 'user-recipient-1');
    assert.equal(sanitized.type, 'DEAL_TRANSFER_REQUEST');
    assert.equal(sanitized.status, 'PENDING');
    assert.equal(sanitized.readAt, null);
    assert.equal(sanitized.createdAt, '2026-09-10T12:00:00.000Z');

    // Sender must only have safe fields
    assert.ok(sanitized.sender);
    assert.equal(sanitized.sender.id, 'user-sender-1');
    assert.equal(sanitized.sender.name, 'Manager Alice');
    assert.equal(sanitized.sender.image, 'https://image.com/alice.jpg');
    assert.equal(sanitized.sender.role, 'MANAGEMENT');
    assert.equal((sanitized.sender as unknown as Record<string, unknown>).password, undefined);
    assert.equal((sanitized.sender as unknown as Record<string, unknown>).email, undefined);
    assert.equal((sanitized.sender as unknown as Record<string, unknown>).resetToken, undefined);

  });

  test('Notification readAt is decoupled from workflow PENDING status', () => {
    const rawNotification = {
      id: 'notif-202',
      recipientId: 'user-2',
      senderId: 'user-1',
      type: 'TEAM_INVITE_REQUEST',
      title: 'Team Invite',
      message: 'Join my team',
      referenceId: 'deal-1',
      status: 'PENDING',
      readAt: new Date('2026-09-10T14:30:00Z'),
      createdAt: new Date('2026-09-10T14:00:00Z'),
      sender: null,
    };

    const sanitized = sanitizeNotificationPayload(rawNotification);
    assert.equal(sanitized.status, 'PENDING');
    assert.equal(sanitized.readAt, '2026-09-10T14:30:00.000Z');
  });
});
