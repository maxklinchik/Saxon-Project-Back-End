// Supabase configuration - edit this file with your credentials
// This file is gitignored to keep secrets safe
module.exports = {
  // Supabase disabled for local/testing. Leave empty to use lowdb fallback.
  url: '',
  serviceKey: '',
  anonKey: '',
  // Email configuration for verification
  email: {
    host: 'smtp.gmail.com', // or your SMTP host
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: '', // your email
      pass: '' // your email password or app password
    }
  }
};