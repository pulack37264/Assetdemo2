/**
 * Email service for notifications (e.g. asset assignment).
 * Set SMTP env vars to enable; if not set, sending is skipped (no error).
 */

import nodemailer from 'nodemailer';
import { fileURLToPath } from 'node:url';

const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER || 'pulack@gmail.com';
const ENABLE_EMAIL_LOGO = process.env.MAIL_INCLUDE_LOGO === 'true';
const LOGO_PATH = ENABLE_EMAIL_LOGO ? fileURLToPath(new URL('../../logo/CBLlogo.jpg', import.meta.url)) : null;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

function buildLogoAttachment() {
  if (!ENABLE_EMAIL_LOGO || !LOGO_PATH) return [];
  return [{
    filename: 'CBLlogo.jpg',
    path: LOGO_PATH,
    cid: 'company-logo',
  }];
}

function buildLogoHtml() {
  if (!ENABLE_EMAIL_LOGO) return '';
  return '<img src="cid:company-logo" alt="City Brokerage Limited logo" style="height: 68px; width: auto; display: block; margin: 0 auto 10px;" />';
}

function isConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!isConfigured()) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  return transporter;
}

/**
 * Send asset assignment notification to the employee's email.
 * @param {{ Name: string, Email?: string }} employee - Employee name and email
 * @param {{ Name: string, SerialNumber?: string } | Array<{ Name: string, SerialNumber?: string }>} assets - One or more assigned assets
 * @param {string} assignedDate - ISO date string of assignment
 */
export async function sendAssignmentNotification(employee, assets, assignedDate) {
  const assignedAssets = Array.isArray(assets) ? assets : [assets];
  if (assignedAssets.length === 0) return;
  const to = employee?.Email?.trim();
  if (!to) {
    console.warn('[email] Assignment notification skipped: no employee email');
    return;
  }
  const transport = getTransporter();
  if (!transport) {
    console.warn('[email] Assignment notification skipped: SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)');
    return;
  }
  
  // Format the assigned date
  const formattedDate = assignedDate 
    ? new Date(assignedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'N/A';
  
  const subject = assignedAssets.length === 1 ? 'IT Asset Assigned Notification' : 'IT Assets Assigned Notification';
  const logoHtml = buildLogoHtml();
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-bottom: 3px solid #DC143C; }
        .company-name { font-size: 24px; font-weight: bold; color: #DC143C; }
        .content { padding: 20px; }
        .greeting { font-size: 16px; font-weight: bold; color: #333; margin-bottom: 15px; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th { background-color: #DC143C; color: white; padding: 12px; text-align: left; font-weight: bold; }
        .table td { padding: 12px; border-bottom: 1px solid #ddd; }
        .table tr:nth-child(even) { background-color: #f9f9f9; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        .warning { background-color: #fff3cd; padding: 10px; border-left: 4px solid #DC143C; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header" style="text-align: center; background-color: #f8f9fa; padding: 20px 20px 10px; border-bottom: 3px solid #DC143C;">
          ${logoHtml}
          <div style="font-size: 20px; letter-spacing: 0.5px; color: #333; text-transform: uppercase; font-weight: 900;">IT Assets Management System</div>
        </div>
        
        <div class="content">
          <p class="greeting">Dear ${escapeHtml(employee.Name || 'Valued Employee')},</p>
          
          <p>We are pleased to inform you that the following ${assignedAssets.length === 1 ? 'IT asset has' : 'IT assets have'} been assigned to you:</p>
          
          <table class="table">
            <thead>
              <tr>
                <th>Asset Name</th>
                <th>Serial Number</th>
                <th>Assignment Date</th>
              </tr>
            </thead>
            <tbody>
              ${assignedAssets.map((asset) => `
                <tr>
                  <td>${escapeHtml(asset.Name || '—')}</td>
                  <td>${escapeHtml(asset.SerialNumber || '—')}</td>
                  <td>${escapeHtml(formattedDate)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="warning">
            <strong>Important:</strong> Please verify that the above information is accurate upon receiving the asset(s). You are responsible for the proper use, care, and safekeeping of this equipment.
          </div>
          
          <p>If you have any questions or notice any discrepancies, please contact the IT Department immediately.</p>
          
          <div class="footer">
            <p><strong>Best Regards,</strong></p>
            <p>CBL INFORMATION TECHNOLOGY DEPARTMENT</p>
            <p>For support, reply to this email or contact the IT Department</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  try {
    await transport.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      html,
      attachments: buildLogoAttachment(),
    });
    console.log('[email] Assignment notification sent to', to);
  } catch (err) {
    console.error('[email] Failed to send assignment notification:', err.message);
  }
}

/**
 * Send asset unassignment notification when an employee returns an asset.
 * @param {{ Name: string, Email?: string }} employee
 * @param {{ Name: string, SerialNumber?: string }} asset
 * @param {string} returnedDate - ISO date string of return
 */
export async function sendUnassignmentNotification(employee, asset, returnedDate) {
  const to = employee?.Email?.trim();
  if (!to) {
    console.warn('[email] Unassignment notification skipped: no employee email');
    return;
  }
  const transport = getTransporter();
  if (!transport) {
    console.warn('[email] Unassignment notification skipped: SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)');
    return;
  }
  
  // Format the returned date
  const formattedDate = returnedDate 
    ? new Date(returnedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'N/A';
  
  const subject = 'Asset Returned - Confirmation';
  const logoHtml = buildLogoHtml();
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-bottom: 3px solid #DC143C; }
        .company-name { font-size: 24px; font-weight: bold; color: #DC143C; }
        .content { padding: 20px; }
        .greeting { font-size: 16px; font-weight: bold; color: #333; margin-bottom: 15px; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th { background-color: #DC143C; color: white; padding: 12px; text-align: left; font-weight: bold; }
        .table td { padding: 12px; border-bottom: 1px solid #ddd; }
        .table tr:nth-child(even) { background-color: #f9f9f9; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        .success-badge { background-color: #d4edda; padding: 10px; border-left: 4px solid #DC143C; margin: 15px 0; color: #155724; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header" style="text-align: center; background-color: #f8f9fa; padding: 20px 20px 10px; border-bottom: 3px solid #DC143C;">
          ${logoHtml}
          <div style="font-size: 20px; letter-spacing: 0.5px; color: #333; text-transform: uppercase; font-weight: 900;">IT Assets Management System</div>
        </div>
        
        <div class="content">
          <p class="greeting">Dear ${escapeHtml(employee.Name || 'Valued Employee')},</p>
          
          <p>Thank you for returning the following IT asset:</p>
          
          <table class="table">
            <thead>
              <tr>
                <th>Asset Details</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Asset Name</strong></td>
                <td>${escapeHtml(asset.Name || '—')}</td>
              </tr>
              <tr>
                <td><strong>Serial Number</strong></td>
                <td>${escapeHtml(asset.SerialNumber || '—')}</td>
              </tr>
              <tr>
                <td><strong>Returned Date</strong></td>
                <td>${escapeHtml(formattedDate)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="success-badge">
            <strong>✓ Return Confirmed:</strong> The asset has been successfully recorded as returned in our system.
          </div>
          
          <p>We appreciate your care and responsibility in maintaining company equipment. If you have any questions, please feel free to contact the IT Department.</p>
          
          <div class="footer">
            <p><strong>Best Regards,</strong></p>
            <p>CBL INFORMATION TECHNOLOGY DEPARTMENT</p>
            <p>For support, reply to this email or contact the IT Department</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  try {
    await transport.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      html,
      attachments: buildLogoAttachment(),
    });
    console.log('[email] Unassignment notification sent to', to);
  } catch (err) {
    console.error('[email] Failed to send unassignment notification:', err.message);
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
