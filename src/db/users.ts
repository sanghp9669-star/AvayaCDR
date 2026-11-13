import { and, eq, isNotNull, or } from 'drizzle-orm';
import { db } from './index.ts';
import { users, type UserRow } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string): Promise<UserRow> {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to sync user profile:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function hasLocalAdminAccount(): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(isNotNull(users.passwordHash))
      .limit(1);
    return rows.length > 0;
  } catch (error) {
    console.error('Failed to check local admin accounts:', error);
    throw new Error('Không thể kiểm tra trạng thái tài khoản quản trị.', { cause: error });
  }
}

export async function findLocalUserByIdentifier(identifier: string): Promise<UserRow | null> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const rows = await db
      .select()
      .from(users)
      .where(
        and(
          isNotNull(users.passwordHash),
          or(eq(users.username, normalized), eq(users.email, normalized))
        )
      )
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Failed to query local user:', error);
    throw new Error('Không thể xác thực tài khoản quản trị.', { cause: error });
  }
}

export async function createLocalAdminUser(
  username: string,
  email: string,
  passwordHash: string
): Promise<UserRow> {
  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = email.trim().toLowerCase();
  const uid = `local:${cleanUsername}`;

  try {
    const inserted = await db
      .insert(users)
      .values({
        uid,
        username: cleanUsername,
        email: cleanEmail,
        passwordHash,
        role: 'admin',
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Failed to create local admin user:', error);
    throw new Error('Không thể tạo tài khoản quản trị viên.', { cause: error });
  }
}
