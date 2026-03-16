import { PrismaClient } from "../src/generated/prisma/client.ts";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";

async function main() {
  // Connect to database
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg({ pool });
  const prisma = new PrismaClient({ adapter });

  const userCount = await prisma.user.count();
  const leagueCount = await prisma.league.count();
  console.log("Current users:", userCount);
  console.log("Current leagues:", leagueCount);

  if (userCount === 0) {
    console.log("No users to clear.");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // Delete leagues first (commissioner FK is not cascade)
  await prisma.league.deleteMany();
  console.log("Deleted all leagues (and cascaded data)");

  // Delete users (cascades to accounts, sessions, etc.)
  await prisma.user.deleteMany();
  console.log("Deleted all users");

  await prisma.verificationToken.deleteMany();
  console.log("Deleted verification tokens");

  const remaining = await prisma.user.count();
  console.log("Remaining users:", remaining);

  await prisma.$disconnect();
  await pool.end();

  // Clear Supabase Auth users
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error("Failed to list Supabase auth users:", error.message);
      return;
    }

    console.log(`Supabase auth users to delete: ${data.users.length}`);
    for (const user of data.users) {
      const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
      if (delError) {
        console.error(`Failed to delete auth user ${user.id}:`, delError.message);
      } else {
        console.log(`Deleted auth user: ${user.email ?? user.id}`);
      }
    }
    console.log("Supabase auth users cleared.");
  } else {
    console.log("Skipping Supabase auth cleanup (no service role key).");
  }

  console.log("Done — all signups cleared.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
