#! /usr/bin/env node
import express, { Request, Response } from "express";
import {config as configDotenv} from 'dotenv'
import axios, { AxiosError, AxiosResponse } from 'axios';
const { Command } = require("commander");

const fs = require("fs");

const program = new Command();
configDotenv()

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
                console.error(data);
                break;

            case 401:
                console.error('unauthorised');
                break;

            case 404:
                console.error('/not-found');
                break;

            case 500:
                console.error('/server-error');
                break;
        }
        return Promise.reject(error);
    }
);

async function upload(image:string, accessToken:string, author:string){

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

    const respUpload = await axios.put<string>(uploadUrl, fsImage, {
        headers: {
            'Content-Type': 'image/jpg',
            Authorization: `Bearer ${accessToken}`
        }
    })
    console.log("Document upload successfully. "+ respUpload.statusText);
    return mediaId;
}

async function publish(str: string, image:string, accessToken:string, author:string) {
    if(!accessToken){
        throw new Error("Token not provided");
    }

    try {
        var imageId = await(image ? upload(image, accessToken, author) : null);
        var payload = {
            "author": "urn:li:person:"+author,
            "commentary": str,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED"
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": false,
            "content":{}
        };
        if( imageId ){
            payload["content"] = {
                    "media": {
                        "title": "Imagen",
                        "id": imageId
                    }
            }
        }

        const response = await axios.post('/rest/posts', payload, {
            headers: {
                Authorization : `Bearer ${accessToken}`
            }
        })
        console.log(response.statusText)

    } catch (error) {
        console.error("Error occurred while publishint to LinkedIn!", error);
    }
}

async function oauth(){
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
            console.log(personal.data);
            const username = personal.data.sub;

            fs.appendFileSync('.env', `LINKEDIN_TOKEN=${accessToken}\n`);
            fs.appendFileSync('.env', `LINKEDIN_USERNAME=${username}\n`);

            console.log("You can break the process Ctrl+C")

            return res.send("You can close this tab");
        } catch ( error : any) {
            console.error(error.message);
            res.status(500).send(error.message);
        }
    });

    app.listen(PORT, () => {
        console.log(`Open http://localhost:${PORT}/login to retrieve an accessToken`);
    });
}

program
    .version("1.0.0")
    .description("A cli tool to publish to Linkedin")
    .option("-h, --hashtags <value>", "a comms separated hashtags")
    .option("-i, --image <value>", "attach an image to the post")
    .option("-t, --token <value>", "oauth token")
    .option("-u, --user <value>", "linkedin author userId")
    .arguments("<string>", "the text to publish")
    .parse(process.argv);

const options = program.opts();

const hashtags = (options.hashtags || "").split(",").map( (s:string) =>
    `{hashtag|\\#|${s}}`).join(" ");

const text = program.args.join(" ") + `\n${hashtags}`

const token = (options.token||process.env.LINKEDIN_TOKEN)
if( !token ){
    oauth()
        .then(()=>{console.log("Done")});
}else {
    publish(text, options.image, token, (options.user || process.env.LINKEDIN_USERNAME))
        .then(() => {
            console.log("Done")
        });
}
