import 'dotenv/config';
import { PrismaClient, ActivityLogType } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('Fetching all users...');
  const users = await prisma.user.findMany();
  
  // Create a map to lookup users by name case-insensitively.
  const userMap = new Map<string, string>();
  for (const user of users) {
    if (user.name) {
      userMap.set(user.name.trim().toLowerCase(), user.id);
    }
  }
  
  console.log(`Found ${users.length} users.`);

  console.log('Fetching all activity logs...');
  const logs = await prisma.activityLog.findMany();
  console.log(`Found ${logs.length} logs to process.`);

  let updatedCount = 0;

  for (const log of logs) {
    let newContent = log.content.trim();
    let newType = log.type;
    let newUserId = log.userId;
    let changed = false;

    // Check for [Prefix]
    const match = newContent.match(/^\[(.*?)\]\s*([\s\S]*)$/);
    if (match) {
      const prefix = match[1].trim();
      const body = match[2].trim();

      // Check if prefix is purely a known user name (or looks like a short name)
      const prefixLower = prefix.toLowerCase();
      
      // If it has words like "added", "changed", "quoted", it's a SYSTEM_UPDATE
      if (prefixLower.includes(' added ') || prefixLower.includes(' changed ') || prefixLower.includes('quoted by')) {
        newType = 'SYSTEM_UPDATE';
        // Keep the content exactly as is, so the full system log string remains intact.
        // Wait, the user said "พวกที่เกี่ยวกับ system ต้องเอาไปใน tab นี่ครับ เช่น 'YUI' added due date..."
        // So we just change the type and keep the content.
        changed = true;
      } else {
        // It's likely a user's name like [BOY] or [YUI]
        // Let's check if the prefix exists in userMap
        const matchedUserId = userMap.get(prefixLower);
        
        if (matchedUserId) {
          // Valid user name!
          newUserId = matchedUserId;
          newContent = body;
          newType = 'COMMENT';
          changed = true;
        } else if (prefix.length < 15 && !prefix.includes(' ')) {
          // If it's a short single word but doesn't match exactly, maybe it's still a name
          // Since we might not have all names matching perfectly, we can still assume it's a comment
          // and strip the prefix. (But we can't change the userId safely).
          newContent = body;
          newType = 'COMMENT';
          changed = true;
        } else {
          // Fallback: treat as system update if it has brackets but no message body
          // e.g. [Some random tag]
          if (!body) {
             newType = 'SYSTEM_UPDATE';
             changed = true;
          }
        }
      }
    }

    if (changed) {
      await prisma.activityLog.update({
        where: { id: log.id },
        data: {
          content: newContent,
          type: newType as ActivityLogType,
          userId: newUserId
        }
      });
      updatedCount++;
    }
  }

  console.log(`Successfully updated ${updatedCount} logs!`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
