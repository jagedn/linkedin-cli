#! /usr/bin/env node
import express, { Request, Response } from "express";
import colors from 'colorts';
const os = require('os');
import {config as configDotenv} from 'dotenv'
import axios, { AxiosError, AxiosResponse } from 'axios';
import path from "node:path";
const { Command } = require("commander");

const fs = require("fs");

const program = new Command();
configDotenv({
    path: path.join(os.homedir(), ".linkedincli"),
})

axios.defaults.baseURL = 'https://api.linkedin.com';
axios.interceptors.request.use((config) => {
    config.responseType = 'json';
    config.headers['X-Restli-Protocol-Version'] = '2.0.0';
    config.headers['LinkedIn-Version']= '202501'
    return config;
});
axios.interceptors.response.use(
    (res) => res,
    (error: AxiosError) => {
        const { data, status, config } = error.response!;
        switch (status) {
            case 400:
                console.error(colors(`${data}`).red+"");
                break;

            case 401:
                console.error(colors('unauthorised').red+"");
                break;

            case 404:
                console.error(colors('/not-found').red+"");
                break;

            case 500:
                console.error(colors('/server-error').red+"");
                break;
        }
        return Promise.reject(error);
    }
);

async function uploadImage(image:string, accessToken:string, author:string){

    var payload = {
        "initializeUploadRequest": {
            "owner": "urn:li:person:"+author
        }
    }

    interface ResponseInit {
        value: {
            uploadUrl: string;
            image: string;
        }
    }

    const respInit = await axios.post<ResponseInit>(`/rest/images?action=initializeUpload`,payload, {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    const uploadUrl = respInit.data.value.uploadUrl;
    const mediaId = respInit.data.value.image;
    const fsImage = fs.readFileSync(image);

    await axios.put<string>(uploadUrl, fsImage, {
        headers: {
            'Content-Type': 'image/jpg',
            Authorization: `Bearer ${accessToken}`
        }
    })
    console.log(colors("Document upload successfully. ").blue+"");
    return mediaId;
}


async function uploadPdf(pdf:string, accessToken:string, author:string){

    var payload = {
        "initializeUploadRequest": {
            "owner": "urn:li:person:"+author
        }
    }

    interface ResponseInit {
        value: {
            uploadUrl: string;
            document: string;
        }
    }

    const respInit = await axios.post<ResponseInit>(`/rest/documents?action=initializeUpload`,payload, {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    const uploadUrl = respInit.data.value.uploadUrl;
    const mediaId = respInit.data.value.document;
    const fsImage = fs.readFileSync(pdf);

    await axios.put<string>(uploadUrl, fsImage, {
        headers: {
            'Content-Type': 'application/octet-stream',
            Authorization: `Bearer ${accessToken}`
        }
    })
    console.log(colors("Document upload successfully. ").blue+"");
    return mediaId;
}

interface PublishOptions {
    footer?: string;
    image?: string;
    pdf?: string;
    token?: string;
    user?: string;
    preview: boolean;
    file: boolean;
}


async function publishPost(converted: string, opts: PublishOptions, accessToken:string, author:string) {
    const image = opts.image;
    const pdf = opts.pdf;
    try {
        var imageId = await(image ? uploadImage(image, accessToken, author) : null);
        var pdfId = await(pdf ? uploadPdf(pdf, accessToken, author) : null);
        var payload :any = {
            "author": "urn:li:person:"+author,
            "commentary": converted,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED"
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": false,
        };
        if( imageId || pdfId){
            (payload as any).content = {
                    "media": {
                        "title": "Attachment",
                        "id": imageId || pdfId,
                    }
            }
        }

        const response = await axios.post('/rest/posts', payload, {
            headers: {
                Authorization : `Bearer ${accessToken}`
            }
        })
        const id = response.headers["x-restli-id"];
        console.log(colors(`Published, id ${id}`).blue+"");

    } catch (error) {
        console.error(colors("Error occurred while publish to LinkedIn!").red+"", error);
    }
}

async function publish(text: string, opts: PublishOptions, accessToken?:string, author?:string) {
    if (!accessToken) {
        throw new Error("Token not provided");
    }
    if (!author) {
        throw new Error("Author not provided");
    }

    const regexHashtag = /#([a-zA-Z0-9_]+)/g;
    const converted = text.replace(regexHashtag, (match, hashtagText) => {
        return `{hashtag|\\#|${hashtagText}}`;
    }).replace("\\n", "\n");


    return publishPost(converted, opts, accessToken, author);
}

async function webserver(msg:string, str?:string, imageUrl?:string){
    const app = express();
    const PORT = 8080;
    const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
    const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
    const REDIRECT_URI = `http://localhost:${PORT}/oauth/callback/linkedin`;

    app.get('/login', (req, res) => {
        const scopes = [
            'profile',
            'email',
            'w_member_social',
            'r_profile_basicinfo',
            'r_verify',
            'openid'
        ].join("%20")
        const linkedinAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&state=123456&scope=`+scopes;
        res.redirect(linkedinAuthUrl);
    });

    app.get('/oauth/callback/linkedin', async (req, res) => {
        const code = req.query.code;
        try {
            const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
                params: {
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: REDIRECT_URI,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                },
            });
            const accessToken = tokenResponse.data.access_token;

            const personal = await axios.get("/v2/userinfo", {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            })

            const username = personal.data.sub;

            fs.appendFileSync(path.join(os.homedir(), ".linkedincli"), `LINKEDIN_TOKEN=${accessToken}\n`);
            fs.appendFileSync(path.join(os.homedir(), ".linkedincli"), `LINKEDIN_USERNAME=${username}\n`);

            console.log(colors("You can now break the process Ctrl+C").blue+"");

            return res.send("You can close this tab");
        } catch ( error : any) {
            console.error(colors(error.message).red+"");
            res.status(500).send(error.message);
        }
    });

    app.get("/preview.jpg", async (req, res) => {
        const filePath = path.resolve(imageUrl||"example.jpg");
        console.log(filePath)
        res.sendFile(filePath)
    })

    app.get("/preview", async (req, res) => {

        const imageBlock = imageUrl ? `
                <div class="post-media">
                    <img src="/preview.jpg" alt="Imagen adjunta al post" class="attached-image">
                </div>
            ` : '';

        const htmlContent = `
<!DOCTYPE html>
<html lang="eng">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LinkedIn Preview</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #f3f2ef; /* Fondo de LinkedIn */
            padding: 20px;
            display: flex;
            justify-content: center;
        }
        .post-container {
            width: 100%;
            max-width: 550px;
            background-color: white;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            margin-top: 20px;
            padding: 16px;
        }
        .post-header {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
        }
        .avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .user-info strong {
            display: block;
            font-size: 14px;
            font-weight: 600;
            color: rgba(0,0,0,.9);
        }
        .user-info span {
            display: block;
            font-size: 12px;
            color: rgba(0,0,0,.6);
        }
        .post-content {
            font-size: 14px;
            line-height: 1.4;
            color: rgba(0,0,0,.9);
            margin-bottom: 10px;
            /* Simulación del estilo de texto */
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .post-media {
            /* Mueve el margen superior al div contenedor de la imagen */
            margin: 10px -16px 0; /* Esto compensa el padding de .post-container para que la imagen sea "edge-to-edge" */
            overflow: hidden; /* Para contener bordes redondeados si se aplica */
        }
        .attached-image {
            width: 100%;
            height: auto;
            display: block;
            /* Si la imagen va a tope, solo se redondean las esquinas de abajo del post-container
               Pero para un look limpio, aplicamos un sutil borde redondeado a la imagen también. */
            object-fit: cover;
        }
        
        /* Estilo para el texto original y explicación */
        .original-text-box {
            border-top: 1px solid #e0e0e0;
            margin-top: 20px;
            padding-top: 10px;
            font-size: 12px;
            color: #888;
        }
        .original-text-box pre {
            background: #f9f9f9;
            padding: 10px;
            border-radius: 4px;
            white-space: pre-wrap;
            word-wrap: break-word;
            margin: 5px 0 0 0;
            border: 1px solid #eee;
        }
        .close-info {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
            color: rgba(0,0,0,.6);
        }
    </style>
</head>
<body>
    <div class="main-wrapper">
        <div class="post-container">
            <div class="post-header">
                <img src="avatarUrl" alt="Avatar" class="avatar">
                <div class="user-info">
                    <strong>name</strong>
                    <span>title</span>
                    <span>1s • <img src="data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTYgMTYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgZGF0YS1EVE09ImVuX1VTX2FsbCIgZGF0YS1zbmFwcz0iMzYzNi4xNjY0NTI3NDgwODQiIGNsYXNzPSJsaXktZGVzaWduLXBhcmVudC11c2VyLXJldG9saW5lIHNhbWUtbGluZS1wYWRkaW5nLXBhcmVudC11c2VyLXJldG9saW5lIj4gPHBhdGggZD0iTTE2IDguOTY1bC0yLjUtMS43MTYgMi41LTEuNzI1LTIuOTgyLTUuNTE0LTMuMTg4Ljg4NXYzLjQyMUw3LjM0NSA3LjM4OCAyLjY1NSA0LjcyNWMtLjIyMS4xMTUtLjQzLjE5Mi0uNTY1LjI3OS0xLjQxNy44OTktMi4wOSAxLjE0Mi0yLjA5IDEuMTQyVjcuMTlDLS4wNjkgOS4wNy4wOTQgMTAuMjEuNTkgMTEuODQ4YzEuMTM4IDIuODcgMy41NDQgMy4xNTIgMy41NDQgMy4xNTIgNi42MDktLjI0OSA3LjczNC0uNzQ2IDcuNzM0LS43NDZzMi40NjItLjUzNyAyLjgyMS0zLjA4NWMuMjMxLTEuNjkyLS41NzctMi42MDQtLjU3Ny0yLjYwNHoiIGZpbGw9IiM2NjY2NjYiPjwvcGF0aD4gPC9zdmc+" width="12" height="12" style="vertical-align: middle;"></span>
                </div>
            </div>

            <div class="post-content">
                ${str}
            </div>
            ${imageBlock}
        </div>
        
    </div>
</body>
</html>            
        `;
        res.setHeader('Content-Type', 'text/html');
        res.send(htmlContent);
    });

    app.listen(PORT, () => {
        console.log(colors(`Open http://localhost:${PORT}${msg}`).blue+"");
    });
}

async function oauth(){
    return webserver('/login to retrieve an accessToken')
}

async function preview(str:string, image?:string){
    return webserver("/preview to preview the post", str.replace("\\n", "<br/>"), image)
}

async function main(args: string[], options: PublishOptions){

    const footer = !options.footer ? "" : options.footer.split(",").map((s:string)=>`#${s}`).join(" ");
    const original = options.file ? fs.readFileSync(args[0]).toString() : args.join(" ");
    const text = original + `\n${footer}`

    const image = options.image;
    const pdf = options.pdf;
    if( image && pdf ){
        console.log(colors("Image and Pdf are incompatible, choose one").red+"");
        return false;
    }

    if( options.preview ){
        await preview(`${text}`, options.image);
    }else{
        const token = (options.token || process.env.LINKEDIN_TOKEN)
        if (!token ) {
            await oauth()
        } else {
            await publish(text, options, token, (options.user || process.env.LINKEDIN_USERNAME))
        }
    }

}

program
    .command('login')
    .description('start the oauth flow')
    .action(oauth);

program
    .version("1.0.0")
    .description("A cli tool to publish to Linkedin")
    .option("-i, --image <file>", "attach an image to the post")
    .option("--pdf <file>", "attach a pdf to the post (usefully for carrusel)")
    .option("-f, --file", "text is a file path to post")
    .option("-p, --preview", "don't publish only show the post")
    .option("--footer <string>", "a comma separated hashtags to include as footer")
    .option("-t, --token <value>", "oauth token")
    .option("-u, --user <value>", "linkedin author userId")
    .arguments("<text...>", "the text (or file path if -f is specified) to publish")
    .action(main);

program.parse(process.argv);
