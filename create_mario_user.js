const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hzsxlpzsknysjdpodpgg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6c3hscHpza255c2pkcG9kcGdnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE3MTUwNSwiZXhwIjoyMDg4NzQ3NTA1fQ.JL9O7BIVDny_aF22U3UJk75pbY7aCjN5h4C2JJHqsFw';
const password = 'ColorMemory123!';
const email = 'mario@gmail.com';
const username = 'Mario';
const role = 'player';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function run() {
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Error listing users:', listError.message);
    process.exit(1);
  }

  let user = users.find(u => u.email === email);
  let userId;

  if (user) {
    console.log('User already exists, updating...');
    const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { 
        user_metadata: { username, role },
        email_confirm: true
      }
    );
    if (updateError) {
      console.error('Error updating user:', updateError.message);
      process.exit(1);
    }
    userId = user.id;
    console.log('User updated successfully.');
  } else {
    console.log('Creating new user...');
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { username, role },
      email_confirm: true
    });
    if (createError) {
      console.error('Error creating user:', createError.message);
      process.exit(1);
    }
    userId = newUser.user.id;
    console.log('User created successfully.');
  }

  console.log('Upserting into profiles table...');
  const { error: upsertError } = await supabase
    .from('profiles')
    .upsert({ id: userId, username, role });

  if (upsertError) {
    console.error('Error upserting profile:', upsertError.message);
    process.exit(1);
  }

  console.log('RESULT_USER_ID:' + userId);
}

run();
