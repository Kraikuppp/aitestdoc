const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const QRCode = require('qrcode');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const cors = require('cors');
const { PDFDocument, rgb } = require('pdf-lib');
const sharp = require('sharp');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads - Use memory storage for Vercel
const storage = multer.memoryStorage();

// Extract folder name from file path
function extractFolderName(filePath) {
    if (!filePath) return null;
    
    // Handle different path formats
    const normalizedPath = filePath.replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/');
    
    // Get the parent folder name (second to last part)
    if (pathParts.length > 1) {
        return pathParts[pathParts.length - 2];
    }
    
    return null;
}


// Email service configuration - Use HTTP APIs instead of SMTP for Railway
const emailService = {
    // Try local SMTP first (for development)
    useLocal: process.env.NODE_ENV !== 'production',
    
    // Gmail SMTP for local development
    gmailConfig: {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER || 'sup06.amptronth@gmail.com',
            pass: process.env.EMAIL_PASS || 'wyxr olrk xypm hdst'
        },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 30000,
        greetingTimeout: 15000,
        socketTimeout: 30000
    },
    
    // EmailJS for production (free HTTP API)
    emailjs: {
        serviceId: process.env.EMAILJS_SERVICE_ID || 'service_auvg5tg',
        templateId: process.env.EMAILJS_TEMPLATE_ID || 'template_l3vud89',
        publicKey: process.env.EMAILJS_PUBLIC_KEY || 'your_public_key',
        privateKey: process.env.EMAILJS_PRIVATE_KEY || 'your_private_key'
    }
};

// Create transporter only for local development
let transporter = null;
if (emailService.useLocal) {
    transporter = nodemailer.createTransport(emailService.gmailConfig);
    
    // Test SMTP connection on startup (local only)
    transporter.verify((error, success) => {
        if (error) {
            console.error('Local SMTP connection error:', error);
        } else {
            console.log('Local SMTP server is ready');
        }
    });
} else {
    console.log('Production mode: Will use HTTP email API instead of SMTP');
}

// Email history storage (in production, use a database)
let emailHistory = [];

// Send email via EmailJS HTTP API (for production)
async function sendEmailViaHTTP(recipientEmail, fileName, qrCodeBase64) {
    try {
        console.log('Sending email via EmailJS...');
        
        // EmailJS configuration
        const emailjsConfig = {
            serviceId: process.env.EMAILJS_SERVICE_ID || 'service_auvg5tg',
            templateId: process.env.EMAILJS_TEMPLATE_ID || 'template_l3vud89',
            publicKey: process.env.EMAILJS_PUBLIC_KEY || 'your_public_key',
            privateKey: process.env.EMAILJS_PRIVATE_KEY || 'your_private_key'
        };
        
        // Convert QR code to data URL
        const qrCodeDataURL = `data:image/png;base64,${qrCodeBase64}`;
        
        // EmailJS template parameters
        const templateParams = {
            to_email: recipientEmail,
            to_name: recipientEmail.split('@')[0],
            fileName: fileName,
            qrCodeImage: qrCodeDataURL,
            fileUrl: '#', // Will be replaced with actual Google Drive URL
            from_name: 'Amptron Instruments Thailand',
            reply_to: 'sup06.amptronth@gmail.com'
        };
        
        // EmailJS API endpoint
        const emailjsUrl = 'https://api.emailjs.com/api/v1.0/email/send';
        
        const emailjsData = {
            service_id: emailjsConfig.serviceId,
            template_id: emailjsConfig.templateId,
            user_id: emailjsConfig.publicKey,
            accessToken: emailjsConfig.privateKey,
            template_params: templateParams
        };
        
        console.log('EmailJS request data:', {
            service_id: emailjsData.service_id,
            template_id: emailjsData.template_id,
            to_email: recipientEmail
        });
        
        // Send request to EmailJS
        const response = await fetch(emailjsUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailjsData)
        });
        
        if (!response.ok) {
            throw new Error(`EmailJS API error: ${response.status} ${response.statusText}`);
        }
        
        const responseText = await response.text();
        console.log('EmailJS response:', responseText);
        
        const result = {
            messageId: `emailjs-${Date.now()}@aitestdoc.railway.app`,
            status: 'sent',
            service: 'EmailJS',
            response: responseText
        };
        
        console.log('Email sent successfully via EmailJS:', result.messageId);
        return result;
        
    } catch (error) {
        console.error('Error sending email via EmailJS:', error);
        throw error;
    }
}

// Function to get logo as base64
function getLogoBase64() {
    try {
        const logoPath = path.join(__dirname, 'WebMeter-logo.png');
        console.log('Looking for logo at:', logoPath);
        const logoBuffer = fs.readFileSync(logoPath);
        console.log('Logo loaded successfully, size:', logoBuffer.length);
        return logoBuffer.toString('base64');
    } catch (error) {
        console.log('Logo error:', error.message);
        return null;
    }
}

// Email template function
function createEmailTemplate(fileName, qrCodeBase64) {
    const logoBase64 = getLogoBase64();
    console.log('QR Code data length:', qrCodeBase64 ? qrCodeBase64.length : 'null');
    console.log('Logo data length:', logoBase64 ? logoBase64.length : 'null');
    
    return {
        subject: 'Test Report & PO - Amptron Instruments Thailand',
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Arial', sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    background-color: #f5f5f5;
                }
                .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    background: white;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }
                .header { 
                    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); 
                    color: white; 
                    padding: 30px 20px; 
                    text-align: center; 
                }
                .logo {
                    max-width: 120px;
                    height: auto;
                    margin-bottom: 15px;
                    border-radius: 8px;
                }
                .header h1 {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .header p {
                    font-size: 14px;
                    opacity: 0.9;
                }
                .content { 
                    padding: 30px 20px; 
                    text-align: center;
                }
                .message {
                    background: #e3f2fd;
                    border-left: 4px solid #2196f3;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 5px;
                    text-align: left;
                    font-size: 16px;
                    line-height: 1.5;
                }
                .qr-container { 
                    text-align: center; 
                    margin: 30px 0; 
                    padding: 30px 20px; 
                    background: #fafafa; 
                    border-radius: 10px; 
                    border: 2px dashed #ddd;
                }
                .qr-code { 
                    max-width: 200px; 
                    height: auto; 
                    border: 3px solid #fff;
                    border-radius: 10px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                }
                .footer { 
                    background: #263238; 
                    color: white; 
                    padding: 25px 20px; 
                    text-align: center; 
                    font-size: 14px;
                }
                .footer .company-name {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: #64b5f6;
                }
                .footer .copyright {
                    opacity: 0.8;
                    margin-top: 15px;
                    font-size: 12px;
                }
                
                /* Mobile Responsive */
                @media only screen and (max-width: 600px) {
                    .container { margin: 10px; }
                    .header { padding: 20px 15px; }
                    .header h1 { font-size: 20px; }
                    .content { padding: 20px 15px; }
                    .message { padding: 15px; font-size: 14px; }
                    .qr-container { padding: 20px 15px; }
                    .qr-code { max-width: 150px; }
                    .footer { padding: 20px 15px; }
                    .footer .company-name { font-size: 16px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="cid:logo" alt="Amptron Logo" class="logo">
                    <h1>Test Report & PO</h1>
                    <p>Amptron Instruments Thailand</p>
                </div>
                
                <div class="content">
                    <div class="message">
                        <strong>This is Email Automatic Please Don't Response</strong><br><br>
                        This Email attach QR code with your purchase order and test report thank you
                    </div>
                    
                    <div class="qr-container">
                        <img src="cid:qrcode" alt="QR Code" class="qr-code">
                    </div>
                </div>
                
                <div class="footer">
                    <div class="company-name">Amptron Instruments Thailand Co., Ltd.</div>
                    <div class="copyright">© 2025 All rights reserved</div>
                </div>
            </div>
        </body>
        </html>
        `
    };
}

// Send email with QR code
async function sendEmailWithQR(recipientEmail, fileName, qrCodeDataUrl) {
    try {
        // Extract base64 data from data URL
        const qrCodeBase64 = qrCodeDataUrl.split(',')[1];
        
        // Get logo as buffer
        const logoBuffer = fs.readFileSync(path.join(__dirname, 'WebMeter-logo.png'));
        const qrCodeBuffer = Buffer.from(qrCodeBase64, 'base64');
        
        const emailTemplate = createEmailTemplate(fileName, qrCodeBase64);
        
        const mailOptions = {
            from: {
                name: 'Amptron Instruments Thailand',
                address: emailService.gmailConfig.auth.user
            },
            to: recipientEmail,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            attachments: [
                {
                    filename: 'logo.png',
                    content: logoBuffer,
                    cid: 'logo'
                },
                {
                    filename: 'qrcode.png',
                    content: qrCodeBuffer,
                    cid: 'qrcode'
                }
            ]
        };
        
        console.log('Attempting to send email to:', recipientEmail);
        
        let result;
        
        if (emailService.useLocal && transporter) {
            // Use SMTP for local development
            console.log('Using local SMTP...');
            result = await transporter.sendMail(mailOptions);
            console.log('Email sent successfully via SMTP:', result.messageId);
        } else {
            // Use HTTP API for production
            console.log('Using HTTP email API for production...');
            result = await sendEmailViaHTTP(recipientEmail, fileName, qrCodeBase64);
        }
        
        // Save to email history
        const emailRecord = {
            id: Date.now().toString(),
            recipientEmail,
            fileName,
            sentAt: new Date().toISOString(),
            messageId: result.messageId,
            status: 'sent'
        };
        
        emailHistory.unshift(emailRecord); // Add to beginning of array
        
        // Keep only last 100 emails
        if (emailHistory.length > 100) {
            emailHistory = emailHistory.slice(0, 100);
        }
        
        console.log(`Email sent successfully to ${recipientEmail} for file: ${fileName}`);
        return { success: true, messageId: result.messageId, emailRecord };
        
    } catch (error) {
        console.error('Error sending email:', error);
        console.error('Error details:', {
            code: error.code,
            command: error.command,
            response: error.response,
            responseCode: error.responseCode
        });
        
        // Save failed attempt to history
        const emailRecord = {
            id: Date.now().toString(),
            recipientEmail,
            fileName,
            sentAt: new Date().toISOString(),
            status: 'failed',
            error: error.message
        };
        
        emailHistory.unshift(emailRecord);
        
        return { success: false, error: error.message };
    }
}

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.doc', '.docx', '.png', '.jpeg', '.jpg'];
        const fileExt = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(fileExt)) {
            cb(null, true);
        } else {
            cb(new Error('ไฟล์ประเภทนี้ไม่รองรับ'), false);
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Google Drive API setup
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const CREDENTIALS_PATH = 'client_secret_537558187339-7s2eifrvcrldk3mo4h7bakjlft6mg454.apps.googleusercontent.com.json';
const TOKEN_PATH = 'token.json';

// Load client secrets from environment or local file
async function loadCredentials() {
    // Try to load from environment variables first (for Railway/production)
    if (process.env.GOOGLE_CREDENTIALS) {
        try {
            return JSON.parse(process.env.GOOGLE_CREDENTIALS);
        } catch (error) {
            console.error('Error parsing GOOGLE_CREDENTIALS environment variable:', error);
        }
    }
    
    // Fallback to local file (for development)
    try {
        const content = await fs.readFile(CREDENTIALS_PATH);
        return JSON.parse(content);
    } catch (error) {
        console.error('Error loading client secret file:', error);
        console.log('Please set GOOGLE_CREDENTIALS environment variable or ensure the credentials file exists');
        throw error;
    }
}

// Create OAuth2 client
async function createOAuth2Client() {
    const credentials = await loadCredentials();
    // Support both 'web' and 'installed' credential types
    const credentialData = credentials.web || credentials.installed;
    const { client_secret, client_id, redirect_uris } = credentialData;
    
    // Use environment-specific callback URL
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : process.env.NODE_ENV === 'production' 
            ? 'https://aitestdoc.up.railway.app' // อัปเดตเป็น URL ใหม่
            : 'http://localhost:3000';
    
    const callbackUrl = `${baseUrl}/oauth/callback`;
    return new google.auth.OAuth2(client_id, client_secret, callbackUrl);
}

// Get access token
async function getAccessToken(oAuth2Client) {
    try {
        const token = await fs.readFile(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(token));
        return oAuth2Client;
    } catch (error) {
        // If token doesn't exist, we need to generate it
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent'
        });
        console.log('Authorize this app by visiting this url:', authUrl);
        throw new Error('Authorization required. Please visit the URL above.');
    }
}

// Create or get folder in Google Drive
async function createOrGetFolder(drive, folderName, parentFolderId = null) {
    try {
        // Search for existing folder
        const query = parentFolderId 
            ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`
            : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            
        const searchResponse = await drive.files.list({
            q: query,
            fields: 'files(id, name)',
        });

        if (searchResponse.data.files.length > 0) {
            // Folder exists, return its ID
            return searchResponse.data.files[0].id;
        } else {
            // Create new folder
            const folderMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
            };
            
            if (parentFolderId) {
                folderMetadata.parents = [parentFolderId];
            }

            const folderResponse = await drive.files.create({
                resource: folderMetadata,
                fields: 'id',
            });

            console.log(`Created folder: ${folderName} with ID: ${folderResponse.data.id}`);
            return folderResponse.data.id;
        }
    } catch (error) {
        console.error('Error creating/getting folder:', error);
        throw error;
    }
}

// Upload file to Google Drive with folder organization
async function uploadToGoogleDrive(fileBuffer, fileName, mimeType, folderPath = null) {
    try {
        const oAuth2Client = await createOAuth2Client();
        await getAccessToken(oAuth2Client);
        
        const drive = google.drive({ version: 'v3', auth: oAuth2Client });
        
        let parentFolderId = null;
        
        // Create folder structure if folderPath is provided
        if (folderPath) {
            // Clean and normalize folder path
            const folderName = folderPath.replace(/[<>:"/\\|?*]/g, '_').trim();
            if (folderName) {
                parentFolderId = await createOrGetFolder(drive, folderName);
            }
        }
        
        const fileMetadata = {
            name: fileName,
        };
        
        // Add parent folder if exists
        if (parentFolderId) {
            fileMetadata.parents = [parentFolderId];
        }
        
        const media = {
            mimeType: mimeType,
            body: require('stream').Readable.from(fileBuffer),
        };
        
        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
        });
        
        // Make file publicly accessible
        await drive.permissions.create({
            fileId: response.data.id,
            resource: {
                role: 'reader',
                type: 'anyone',
            },
        });
        
        return {
            fileId: response.data.id,
            viewUrl: `https://drive.google.com/file/d/${response.data.id}/view`,
            downloadUrl: `https://drive.google.com/uc?id=${response.data.id}`,
            folderName: folderPath || 'Root'
        };
    } catch (error) {
        console.error('Error uploading to Google Drive:', error);
        throw error;
    }
}

// Create ZIP file from multiple files
async function createZipFile(files, outputPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        output.on('close', () => {
            console.log(`ZIP file created: ${archive.pointer()} total bytes`);
            resolve(outputPath);
        });

        archive.on('error', (err) => {
            reject(err);
        });

        archive.pipe(output);

        files.forEach(file => {
            archive.append(file.buffer, { name: file.originalname });
        });

        archive.finalize();
    });
}

// Convert image to PDF page
async function addImageToPDF(pdfDoc, imageBuffer) {
    try {
        const processedBuffer = await sharp(imageBuffer)
            .resize(595, 842, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer();
        
        const image = await pdfDoc.embedPng(processedBuffer);
        const page = pdfDoc.addPage([595, 842]); // A4 size
        
        const { width, height } = image.scale(1);
        const pageWidth = 595;
        const pageHeight = 842;
        
        // Center the image on the page
        const x = (pageWidth - width) / 2;
        const y = (pageHeight - height) / 2;
        
        page.drawImage(image, {
            x: Math.max(0, x),
            y: Math.max(0, y),
            width: Math.min(width, pageWidth),
            height: Math.min(height, pageHeight),
        });
        
        return page;
    } catch (error) {
        console.error('Error adding image to PDF:', error);
        throw error;
    }
}

// Convert DOC/DOCX to PDF page
async function addDocToPDF(pdfDoc, docBuffer) {
    try {
        const result = await mammoth.extractRawText({ buffer: docBuffer });
        const text = result.value;
        
        const page = pdfDoc.addPage([595, 842]); // A4 size
        const fontSize = 12;
        const margin = 50;
        const lineHeight = fontSize * 1.2;
        const maxWidth = 595 - (margin * 2);
        
        // Split text into lines that fit the page width
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            if (testLine.length * (fontSize * 0.6) > maxWidth) {
                if (currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    lines.push(word);
                }
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        
        // Draw text on page
        let y = 842 - margin;
        for (const line of lines) {
            if (y < margin) break; // Stop if we run out of space
            page.drawText(line, {
                x: margin,
                y: y,
                size: fontSize,
                color: rgb(0, 0, 0),
            });
            y -= lineHeight;
        }
        
        return page;
    } catch (error) {
        console.error('Error adding DOC to PDF:', error);
        throw error;
    }
}

// Create combined PDF from multiple files
async function createCombinedPDF(files, outputPath) {
    try {
        const pdfDoc = await PDFDocument.create();
        
        for (const file of files) {
            const fileExt = path.extname(file.originalname).toLowerCase();
            
            if (fileExt === '.pdf') {
                // If it's already a PDF, merge it
                const existingPdf = await PDFDocument.load(file.buffer);
                const pages = await pdfDoc.copyPages(existingPdf, existingPdf.getPageIndices());
                pages.forEach((page) => pdfDoc.addPage(page));
            } else if (['.png', '.jpg', '.jpeg'].includes(fileExt)) {
                // Convert image to PDF page
                await addImageToPDF(pdfDoc, file.buffer);
            } else if (['.doc', '.docx'].includes(fileExt)) {
                // Convert DOC/DOCX to PDF page
                await addDocToPDF(pdfDoc, file.buffer);
            }
        }
        
        const pdfBytes = await pdfDoc.save();
        await fs.writeFile(outputPath, pdfBytes);
        
        console.log(`Combined PDF created: ${outputPath}`);
        return outputPath;
    } catch (error) {
        console.error('Error creating combined PDF:', error);
        throw error;
    }
}

// Generate QR Code with logo
async function generateQRCode(url) {
    try {
        // First generate the QR code
        const qrCodeDataURL = await QRCode.toDataURL(url, {
            width: 300,
            margin: 2,
            errorCorrectionLevel: 'H', // High error correction to allow logo overlay
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });

        // Load the QR code image
        const qrBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');
        const qrImage = await sharp(qrBuffer);
        
        // Load and resize the logo
        const logoPath = path.join(__dirname, 'public', 'WebMeter-logo.png');
        const logoExists = await fs.pathExists(logoPath);
        
        if (logoExists) {
            // Create a white background circle for the logo
            const logoSize = 80; // Increased size
            const circleSize = logoSize + 10; // White circle slightly larger
            
            // Create white circle background
            const whiteCircle = Buffer.from(
                `<svg width="${circleSize}" height="${circleSize}">
                    <circle cx="${circleSize/2}" cy="${circleSize/2}" r="${circleSize/2}" fill="white" stroke="white" stroke-width="2"/>
                </svg>`
            );
            
            const whiteCircleBuffer = await sharp(whiteCircle)
                .png()
                .toBuffer();

            // Process logo with better quality
            const logoBuffer = await sharp(logoPath)
                .resize(logoSize, logoSize, { 
                    fit: 'contain', 
                    background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
                })
                .sharpen() // Add sharpening
                .png({ quality: 100 }) // Maximum quality
                .toBuffer();

            // Get QR code dimensions
            const { width, height } = await qrImage.metadata();
            
            // Calculate center positions
            const circleX = Math.round((width - circleSize) / 2);
            const circleY = Math.round((height - circleSize) / 2);
            const logoX = Math.round((width - logoSize) / 2);
            const logoY = Math.round((height - logoSize) / 2);

            // Composite white circle first, then logo
            const finalImage = await qrImage
                .composite([
                    {
                        input: whiteCircleBuffer,
                        left: circleX,
                        top: circleY
                    },
                    {
                        input: logoBuffer,
                        left: logoX,
                        top: logoY
                    }
                ])
                .sharpen() // Sharpen the final image
                .png({ quality: 100 })
                .toBuffer();

            // Convert back to data URL
            const finalDataURL = `data:image/png;base64,${finalImage.toString('base64')}`;
            return finalDataURL;
        } else {
            // Return original QR code if logo doesn't exist
            console.log('Logo file not found, returning QR code without logo');
            return qrCodeDataURL;
        }
    } catch (error) {
        console.error('Error generating QR code with logo:', error);
        // Fallback to simple QR code
        const qrCodeDataURL = await QRCode.toDataURL(url, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        return qrCodeDataURL;
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Debug route
app.get('/test', (req, res) => {
    res.send('Server is working! Routes are active.');
});

// OAuth callback route
app.get('/oauth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('Authorization code not found');
    }

    try {
        const oAuth2Client = await createOAuth2Client();
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);

        // Store the token to disk for later program executions
        await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
        console.log('Token stored to', TOKEN_PATH);

        res.send(`
            <html>
                <body>
                    <h2>Authorization successful!</h2>
                    <p>You can now close this window and return to the application.</p>
                    <script>window.close();</script>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Error retrieving access token', error);
        res.status(500).send('Error retrieving access token');
    }
});

// Upload endpoint
app.post('/upload', upload.array('files'), async (req, res) => {
    try {
        const files = req.files;
        const uploadMode = req.body.uploadMode || 'individual';

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'ไม่พบไฟล์ที่อัปโหลด' });
        }

        const results = [];

        if (uploadMode === 'combined' && files.length > 1) {
            // Combine files into a single PDF
            const currentDate = new Date();
            const day = currentDate.getDate().toString().padStart(2, '0');
            const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
            const year = currentDate.getFullYear();
            const pdfFileName = `testreport-${day}${month}${year}.pdf`;
            const pdfPath = path.join('uploads', pdfFileName);
            
            await createCombinedPDF(files, pdfPath);
            
            // Get folder name from first file (assuming all files from same folder)
            const folderName = req.body.folderName || extractFolderName(files[0].originalname);
            
            // Upload PDF to Google Drive
            const pdfBuffer = await fs.readFile(pdfPath);
            const driveResult = await uploadToGoogleDrive(
                pdfBuffer,
                pdfFileName,
                'application/pdf',
                folderName
            );
            
            // Generate QR code
            const qrCode = await generateQRCode(driveResult.viewUrl);
            
            results.push({
                fileName: pdfFileName,
                fileId: driveResult.fileId,
                viewUrl: driveResult.viewUrl,
                downloadUrl: driveResult.downloadUrl,
                qrCode: qrCode,
                type: 'combined-pdf'
            });
            
            // Clean up local PDF file
            await fs.remove(pdfPath);
        } else {
            // Upload files individually
            for (const file of files) {
                // Get folder name from file path or request body
                const folderName = req.body.folderName || extractFolderName(file.originalname);
                
                const driveResult = await uploadToGoogleDrive(
                    file.buffer,
                    file.originalname,
                    file.mimetype,
                    folderName
                );
                
                const qrCode = await generateQRCode(driveResult.viewUrl);
                
                results.push({
                    fileName: file.originalname,
                    fileId: driveResult.fileId,
                    viewUrl: driveResult.viewUrl,
                    downloadUrl: driveResult.downloadUrl,
                    qrCode: qrCode,
                    type: 'individual'
                });
            }
        }

        // No need to clean up files since we're using memory storage

        res.json({
            success: true,
            message: 'อัปโหลดไฟล์สำเร็จ',
            results: results
        });

    } catch (error) {
        console.error('Upload error:', error);
        
        // No cleanup needed for memory storage

        res.status(500).json({
            success: false,
            error: error.message || 'เกิดข้อผิดพลาดในการอัปโหลด'
        });
    }
});

// Check authorization status
app.get('/auth-status', async (req, res) => {
    try {
        const tokenExists = await fs.pathExists(TOKEN_PATH);
        if (tokenExists) {
            res.json({ authorized: true });
        } else {
            const oAuth2Client = await createOAuth2Client();
            const authUrl = oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES,
                prompt: 'consent'
            });
            res.json({ authorized: false, authUrl: authUrl });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error checking authorization status' });
    }
});

// Send email endpoint
app.post('/send-email', async (req, res) => {
    try {
        const { recipientEmail, fileName, qrCodeDataUrl } = req.body;
        
        if (!recipientEmail || !fileName || !qrCodeDataUrl) {
            return res.status(400).json({ 
                success: false, 
                error: 'ข้อมูลไม่ครบถ้วน กรุณาระบุอีเมล ชื่อไฟล์ และ QR Code' 
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recipientEmail)) {
            return res.status(400).json({ 
                success: false, 
                error: 'รูปแบบอีเมลไม่ถูกต้อง' 
            });
        }
        
        const result = await sendEmailWithQR(recipientEmail, fileName, qrCodeDataUrl);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'ส่งอีเมลสำเร็จ',
                messageId: result.messageId,
                emailRecord: result.emailRecord
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || 'เกิดข้อผิดพลาดในการส่งอีเมล'
            });
        }
        
    } catch (error) {
        console.error('Send email endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'เกิดข้อผิดพลาดในการส่งอีเมล'
        });
    }
});

// Get email history endpoint
app.get('/email-history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const paginatedHistory = emailHistory.slice(offset, offset + limit);
        
        res.json({
            success: true,
            history: paginatedHistory,
            total: emailHistory.length,
            limit,
            offset
        });
    } catch (error) {
        console.error('Email history endpoint error:', error);
        res.status(500).json({
            success: false,
            error: 'เกิดข้อผิดพลาดในการดึงประวัติอีเมล'
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`AITESTDOC server running on http://localhost:${PORT}`);
    console.log('Make sure to authorize the application before uploading files.');
});

module.exports = app;
