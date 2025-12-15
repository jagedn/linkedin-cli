# 🚀 LinkedIn CLI Publisher

A command-line interface (CLI) tool built with Node.js to publish content, including images and hashtags, directly to LinkedIn.

## ✨ Features

* **Simple Publishing:** Post text, images, and hashtags directly from your terminal.
* **Automatic Login:** Handles the OAuth 2.0 flow to obtain an access token if one is not present.
* **Image Support:** Attach a single image to your post.
* **Hashtag Handling:** Easily include a list of comma-separated hashtags.

## 📋 Prerequisites

Before you begin, you will need:

1.  **Node.js** installed on your system.
2.  A **LinkedIn Developer Application**. You must create an application on the [LinkedIn Developer Portal](https://developer.linkedin.com/) to get your required credentials.
    * **Note:** Ensure your application has the necessary permissions (e.g., `w_member_social`).
3.  Your **Client ID** and **Client Secret** from your LinkedIn application.

## ⚙️ Installation

1.  Clone the repository:
    ```bash
    git clone [your-repo-url]
    cd linkedin-cli-publisher
    ```
2.  Install the dependencies:
    ```bash
    npm install -g 
    ```
3.  **Configure Environment Variables:**
    Create a file named `.env` in the root of your project and add your LinkedIn application credentials:
    ```
    # .env file
    LINKEDIN_CLIENT_ID="YOUR_CLIENT_ID_HERE"
    LINKEDIN_CLIENT_SECRET="YOUR_CLIENT_SECRET_HERE"
    ```

## 💻 Usage

### **Mandatory Argument**

* The **text content** of your post is always required and should be passed as the last argument.

### **Optional Parameters**

| Parameter | Description | Example |
| :--- | :--- | :--- |
| `-i`, `--image` | Path to the image file to attach. | `-i ./path/to/my/image.jpg` |
| `-h`, `--hashtags` | A comma-separated list of hashtags to include in the post. | `-h "nodejs,cli,linkedin"` |

### **Examples**

#### 1. Basic Post

Publish a text-only update:

```bash
linkedin "Hello world! This is my first post from the command line using my new Node.js tool."
```

#### 1. Post with Hashtags

Publish text and append a list of hashtags::

```bash
linkedin -h "automation,developer,cli" "Check out this cool new LinkedIn publisher I built!"
```

## Authentication Flow

If the script does not find a valid _access_token_, it will:

Generate a LinkedIn authorization URL.

Print the URL to the console, prompting you to visit it in your browser.

Once authorized, LinkedIn will redirect you to the specified LINKEDIN_REDIRECT_URI (e.g., http://localhost:3000/callback?code=...).

The script will capture the authorization code, exchange it for a long-lived access_token, and save it for future use (e.g., in a local .env file). Future posts will use this saved token automatically.

