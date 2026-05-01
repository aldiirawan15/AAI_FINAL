const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sharp = require('sharp');
const { createCanvas, registerFont, Image } = require('canvas');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const emojiRegex = require('emoji-regex');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot WA hidup 🚀');
});

app.listen(PORT, () => console.log('Web server jalan'));

// ======================
// KONFIGURASI
// ======================
const OWNER_NUMBER = '6281529434240'; 
const OWNER_LID = '123128206340263';  

let isBotActive = true;

// ======================
// FONT
// ======================
registerFont(path.join(__dirname, 'fonts/Bangers-Regular.ttf'), {
    family: 'Bangers'
});

// ======================
// CLIENT
// ======================
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });  // ← ini yang bener
    client.on('ready', () => console.log('🤖 Bot hidup'));
});

// ======================
// HELPER: VALIDASI OWNER
// ======================
const isOwner = (msg) => {
    const sender = msg.author || msg.from || ''; 
    return sender.includes(OWNER_NUMBER) || sender.includes(OWNER_LID);
};

// ======================
// HELPER: .s (BANGERS FONT) MENGUKUR LEBAR TEKS + EMOJI
// ======================
function measureMixedText(ctx, text, fontSize) {
    const regex = emojiRegex();
    let totalWidth = 0;
    let lastIndex = 0;
    let match;
    
    ctx.font = `${fontSize}px "Bangers"`;

    while ((match = regex.exec(text)) !== null) {
        const textPart = text.substring(lastIndex, match.index);
        totalWidth += ctx.measureText(textPart).width;
        totalWidth += (fontSize * 0.85) + (fontSize * 0.05); 
        lastIndex = regex.lastIndex;
    }
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
        totalWidth += ctx.measureText(remainingText).width;
    }
    return totalWidth;
}

// ======================
// HELPER: .s (BANGERS FONT) MENGGAMBAR TEKS + EMOJI
// ======================
async function drawTextWithEmojis(ctx, text, x, y, maxWidth, fontSize) {
    const regex = emojiRegex();
    const tokens = [];
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            tokens.push({ type: 'text', content: text.substring(lastIndex, match.index) });
        }
        tokens.push({ type: 'emoji', content: match[0] });
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
        tokens.push({ type: 'text', content: text.substring(lastIndex) });
    }

    const fontStyle = `${fontSize}px "Bangers"`; 
    ctx.font = fontStyle;

    let totalWidth = 0;
    const emojiSize = fontSize * 0.85; 

    for (const token of tokens) {
        if (token.type === 'text') {
            totalWidth += ctx.measureText(token.content).width;
        } else {
            totalWidth += emojiSize + (fontSize * 0.05); 
        }
    }

    let currentX = x - (totalWidth / 2);

    ctx.shadowColor = 'black';
    ctx.shadowBlur = 5;

    for (const token of tokens) {
        if (token.type === 'text') {
            ctx.font = fontStyle;
            ctx.textBaseline = 'middle'; 
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = Math.max(3, fontSize * 0.08); 
            
            ctx.strokeText(token.content, currentX, y);
            ctx.fillText(token.content, currentX, y);
            currentX += ctx.measureText(token.content).width;
        } else {
            try {
                const codePoint = [...token.content].map(c => c.codePointAt(0).toString(16)).join('-');
                const emojiUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${codePoint}.png`;
                
                const response = await axios.get(emojiUrl, { responseType: 'arraybuffer' });
                const emojiImg = new Image();
                emojiImg.src = Buffer.from(response.data, 'binary');

                const emojiY = y - (emojiSize / 2) + (fontSize * 0.02);

                ctx.drawImage(emojiImg, currentX, emojiY, emojiSize, emojiSize);
                currentX += emojiSize + (fontSize * 0.05); 
            } catch (err) {
                ctx.font = fontStyle; 
                ctx.textBaseline = 'middle';
                ctx.fillText(token.content, currentX, y);
                currentX += ctx.measureText(token.content).width;
            }
        }
    }
}

// ======================
// MESSAGE HANDLER
// ======================
client.on('message', async (msg) => {
    try {
        const body = msg.body.trim();
        const lower = body.toLowerCase();

        // ======================
        // COMMAND ON/OFF BOT (KHUSUS OWNER)
        // ======================
        if (lower === '.bot off') {
            if (!isOwner(msg)) return msg.reply('❌ Lau sape mpruy?');
            if (!isBotActive) return msg.reply('⚠️ Bot udah mati dari tadi kck');
            
            isBotActive = false;
            return msg.reply('Bot dimatikan');
        }

        if (lower === '.bot on') {
            if (!isOwner(msg)) return msg.reply('❌ Lau sape mpruy?');
            if (isBotActive) return msg.reply('⚠️ Bot udah nyala kck');
            
            isBotActive = true;
            return msg.reply('Bot diaktifkan');
        }

        // SATPAM PENJAGA
        if (!isBotActive) return;

        // ======================
        // COMMAND .tt (TikTok Downloader)
        // ======================
        if (lower.startsWith('.tt ')) {
            const url = body.slice(4).trim();
            if (!url.includes('tiktok.com')) return msg.reply('❌ Link TikTok-nya mana bwang?');

            msg.reply('⏳ Bentar, lagi proses...');
            
            try {
                const res = await axios.get(`https://www.tikwm.com/api/?url=${url}`);
                if (res.data.code !== 0) throw new Error('Video gagal didapat');

                const videoUrl = res.data.data.hdplay || res.data.data.play;
                
                const vidRes = await axios.get(videoUrl, { responseType: 'arraybuffer' });
                const base64 = Buffer.from(vidRes.data, 'binary').toString('base64');
                const media = new MessageMedia('video/mp4', base64);

                return msg.reply(media, null);
            } catch (err) {
                console.error('TT Downloader Error:', err);
                return msg.reply('❌ Gagal download. Pastiin linknya bener dan akun nggak di-private.');
            }
        }

// ======================
        // COMMAND .ss (FIXED AUTO FIT + EMOJI SEJAJAR)
        // ======================
        if (lower.startsWith('.ss')) {
            const text = body.slice(3).trim();
            if (!text) return msg.reply('❌ Isi teksnya jangan kosong');

            const size = 512;
            const padding = 60;
            const maxWidth = size - padding;

            const canvas = createCanvas(size, size);
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, size, size);

            ctx.fillStyle = 'black';
            ctx.textAlign = 'left';
            
            // 🔴 FIX 1: Ubah baseline ke 'middle' biar gampang narik emoji jadi sejajar
            ctx.textBaseline = 'middle'; 

            const words = text.split(/\s+/);

            let fontSize = 180; 
            let lines = [];
            let lineHeight;
            let totalHeight;

            const measureSS = (txt) => {
                const regex = emojiRegex();
                let w = 0;
                let lastIndex = 0;
                let match;
                
                // Tambahin 'bold' biar teksnya lebih padat kayak di status WA
                ctx.font = `bold ${fontSize}px sans-serif`;
                const emjSize = fontSize * 0.85;
                
                while ((match = regex.exec(txt)) !== null) {
                    w += ctx.measureText(txt.substring(lastIndex, match.index)).width;
                    w += emjSize + (fontSize * 0.05); 
                    lastIndex = regex.lastIndex;
                }
                w += ctx.measureText(txt.substring(lastIndex)).width;
                return w;
            };

            const wrapText = () => {
                const result = [];
                let line = [];

                for (const word of words) {
                    const test = [...line, word].join(' ');
                    if (measureSS(test) > maxWidth && line.length) {
                        result.push(line);
                        line = [word];
                    } else {
                        line.push(word);
                    }
                }
                if (line.length) result.push(line);
                return result;
            };

            do {
                lines = wrapText();
                lineHeight = fontSize + 15; // Jarak atas-bawah dibikin lebih rapet
                totalHeight = lines.length * lineHeight;

                const widest = Math.max(
                    ...lines.map(l => measureSS(l.join(' ')))
                );

                if (totalHeight > size - padding || widest > maxWidth) {
                    fontSize -= 5;
                } else {
                    break;
                }

            } while (fontSize > 25);

            ctx.font = `bold ${fontSize}px sans-serif`;
            
            // 🔴 FIX 2: Matikan shadow biar warna hitam teksnya tajam & bersih
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0; 

            // 🔴 FIX 3: Hitungan titik Y awal disesuaikan karena kita pakai baseline 'middle'
            let y = (size - totalHeight) / 2 + (lineHeight / 2);

            const drawWordSS = async (word, currentX, currentY) => {
                const regex = emojiRegex();
                const tokens = [];
                let match;
                let lastIndex = 0;

                while ((match = regex.exec(word)) !== null) {
                    if (match.index > lastIndex) tokens.push({ type: 'text', content: word.substring(lastIndex, match.index) });
                    tokens.push({ type: 'emoji', content: match[0] });
                    lastIndex = regex.lastIndex;
                }
                if (lastIndex < word.length) tokens.push({ type: 'text', content: word.substring(lastIndex) });

                const emjSize = fontSize * 0.85;

                for (const token of tokens) {
                    if (token.type === 'text') {
                        ctx.fillText(token.content, currentX, currentY);
                        currentX += ctx.measureText(token.content).width;
                    } else {
                        try {
                            const codePoint = [...token.content].map(c => c.codePointAt(0).toString(16)).join('-');
                            const emojiUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${codePoint}.png`;
                            const response = await axios.get(emojiUrl, { responseType: 'arraybuffer' });
                            const emojiImg = new Image();
                            emojiImg.src = Buffer.from(response.data, 'binary');

                            // 🔴 FIX 4: Rumus penarik emoji biar center dengan teks sans-serif
                            const emojiY = currentY - (emjSize / 2); 
                            
                            ctx.drawImage(emojiImg, currentX, emojiY, emjSize, emjSize);
                            currentX += emjSize + (fontSize * 0.02); // Spasi dibikin makin mepet
                        } catch (err) {
                            ctx.fillText(token.content, currentX, currentY);
                            currentX += ctx.measureText(token.content).width;
                        }
                    }
                }
            };

            for (const lineWords of lines) {
                if (lineWords.length === 1) {
                    await drawWordSS(lineWords[0], padding / 2, y);
                } else {
                    let wordsWidth = 0;
                    for (const word of lineWords) {
                        wordsWidth += measureSS(word);
                    }
                    
                    const totalSpace = maxWidth - wordsWidth;
                    // Jaga-jaga biar spasi nggak jadi angka negatif kalau teksnya nge-press banget
                    const spaceBetween = Math.max(0, totalSpace / (lineWords.length - 1));

                    let x = padding / 2;

                    for (const word of lineWords) {
                        await drawWordSS(word, x, y);
                        x += measureSS(word) + spaceBetween;
                    }
                }
                y += lineHeight;
            }

            const png = canvas.toBuffer('image/png');
            const webp = await sharp(png).webp({ quality: 95 }).toBuffer();

            const sticker = new MessageMedia(
                'image/webp',
                webp.toString('base64')
            );

            return msg.reply(sticker, null, { sendMediaAsSticker: true });
        }
        
        // ======================
        // GATE COMMAND .s
        // ======================
        if (lower !== '.s' && !lower.startsWith('.s ')) return;

        const text = body.slice(2).trim();

        // ======================
        // AMBIL MEDIA (DIRECT / REPLY)
        // ======================
        let mediaMsg = null;
        if (msg.hasMedia) mediaMsg = msg;
        if (!mediaMsg && msg.hasQuotedMsg) {
            const quoted = await msg.getQuotedMessage();
            if (quoted.hasMedia) mediaMsg = quoted;
        }

        // ======================
        // PROSES MEDIA (GAMBAR / VIDEO / GIF) + EMOJI
        // ======================
        if (mediaMsg) {
            const media = await mediaMsg.downloadMedia();
            if (!media || !media.data) throw new Error('Media rusak');

            if (media.mimetype.includes('video') || media.mimetype.includes('gif')) {
                msg.reply('⏳ Bentar, lagi proses...');

                const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const tempInput = path.join(__dirname, `temp_${uniqueId}.${media.mimetype.split('/')[1]}`);
                const tempOutput = path.join(__dirname, `temp_${uniqueId}.webp`);

                fs.writeFileSync(tempInput, Buffer.from(media.data, 'base64'));

                ffmpeg(tempInput)
                    .setDuration(6) 
                    .videoFilters([
                        'crop=min(iw\\,ih):min(iw\\,ih)', 
                        'scale=512:512'                   
                    ])
                    .outputOptions([
                        '-vcodec', 'libwebp',     
                        '-r', '15',               
                        '-q:v', '50',             
                        '-loop', '0',             
                        '-preset', 'default',
                        '-an'                     
                    ])
                    .save(tempOutput)
                    .on('end', async () => {
                        try {
                            const webpBuffer = fs.readFileSync(tempOutput);
                            const sticker = new MessageMedia('image/webp', webpBuffer.toString('base64'));
                            
                            await msg.reply(sticker, null, { sendMediaAsSticker: true });
                        } catch (err) {
                            console.error('Error saat kirim stiker:', err);
                            msg.reply('❌ Gagal, video lu kepanjangan/hd. Coba kirim video 4 detik aja dan jangan HD ');
                        } finally {
                            if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
                            if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
                        }
                    })
                    .on('error', (err) => {
                        console.error('Error FFmpeg:', err);
                        msg.reply('❌ Error pas convert video. Format nggak didukung atau durasi kepanjangan.');
                        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
                        if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
                    });

                return; 
            }

            if (media.mimetype.includes('image')) {
                const buffer = Buffer.from(media.data, 'base64');
                const image = sharp(buffer);
                const meta = await image.metadata();
                const sizeImg = Math.min(meta.width, meta.height);

                const imgBuffer = await image
                    .extract({
                        left: Math.floor((meta.width - sizeImg) / 2),
                        top: Math.floor((meta.height - sizeImg) / 2),
                        width: sizeImg,
                        height: sizeImg
                    })
                    .resize(512, 512)
                    .png()
                    .toBuffer();

                const size = 512;
                const canvas = createCanvas(size, size);
                const ctx = canvas.getContext('2d');

                const img = new Image();
                img.src = imgBuffer;
                ctx.drawImage(img, 0, 0, size, size);

                if (text) {
                    const getFontSize = (len) => {
                        if (len <= 10) return 80;
                        if (len <= 20) return 60;
                        if (len <= 40) return 40;
                        return 30;
                    };

                    let fontSize = getFontSize(text.length);
                    const maxWidth = size - 40;

                    ctx.textBaseline = 'middle';
                    await drawTextWithEmojis(ctx, text, size / 2, size - 40, maxWidth, fontSize);
                }

                const webp = await sharp(canvas.toBuffer())
                    .webp({ quality: 90 })
                    .toBuffer();

                const sticker = new MessageMedia(
                    'image/webp',
                    webp.toString('base64')
                );

                return msg.reply(sticker, null, { sendMediaAsSticker: true });
            }
        }

        // ======================
        // PROSES .s (TEKS DOANG → STIKER TRANSPARAN + EMOJI)
        // ======================
        if (!text) return msg.reply('❌ Isi teksnya, jangan males');

        const size = 512;
        const padding = 60;
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');

        ctx.textBaseline = 'middle'; 
        
        let fontSize = 140;
const maxWidth = size - padding;
let lines = [];

const wrapMixedText = () => {
    const words = text.split(' ');
    const result = [];
    let line = '';

    for (const word of words) {
        const testLine = line + word + ' ';
        const testWidth = measureMixedText(ctx, testLine, fontSize);

        if (testWidth > maxWidth && line !== '') {
            result.push(line.trim());
            line = word + ' ';
        } else {
            line = testLine;
        }
    }
    if (line) result.push(line.trim());
    return result;
};

        
        let lineHeight;
let totalHeight;
do {
    lines = wrapMixedText();
    lineHeight = fontSize * 1.2;
    totalHeight = lines.length * lineHeight;

    // Cek tinggi DAN lebar tiap baris
    const widestLine = Math.max(...lines.map(l => measureMixedText(ctx, l, fontSize)));

    if (totalHeight > size - padding || widestLine > maxWidth) {
        fontSize -= 5;
    } else {
        break;
    }
} while (fontSize > 25);

        let startY = (size - totalHeight) / 2 + (lineHeight / 2);

        for (const line of lines) {
            await drawTextWithEmojis(ctx, line, size / 2, startY, maxWidth, fontSize);
            startY += lineHeight;
        }

        const png = canvas.toBuffer('image/png');
        const webp = await sharp(png).webp({ quality: 90 }).toBuffer();

        const sticker = new MessageMedia(
            'image/webp',
            webp.toString('base64')
        );

        await msg.reply(sticker, null, { sendMediaAsSticker: true });

    } catch (err) {
        console.error(err);
        msg.reply('❌ Error.');
    }
});

client.initialize();