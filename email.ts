import nodemailer, { type Transporter } from "nodemailer";
import { smtpConfig } from "./config";
import { logger } from "./logger";

export class EmailClient {
    private static _instance: EmailClient;
    private transporter: Transporter | undefined;

    private readonly smtpUser: string | undefined;
    private readonly smtpPass: string | undefined;
    private readonly smtpToUser: string | undefined;
    private readonly smtpHost: string | undefined;
    private readonly smtpPort: number | undefined;

    public static get Instance() {
        return this._instance || (this._instance = new this());
    }

    constructor() {
        this.smtpUser = smtpConfig.user;
        this.smtpPass = smtpConfig.pass;
        this.smtpHost = smtpConfig.host;
        this.smtpPort = smtpConfig.port;
        this.smtpToUser = smtpConfig.toUser;

        if (!smtpConfig.isConfigured) {
            logger.warn("SMTP not fully configured - email notifications disabled");
            return;
        }

        this.transporter = nodemailer.createTransport({
            host: this.smtpHost,
            port: this.smtpPort,
            secure: true,
            auth: {
                user: this.smtpUser,
                pass: this.smtpPass,
            },
        });

        logger.info({ host: this.smtpHost }, "Email client initialized");
    }

    sendSuccessEmail = async (html: string) => {
        if (!this.transporter) {
            logger.warn("No transporter configuration - skipping success email");
            return;
        }

        try {
            await this.transporter.sendMail({
                from: this.smtpUser,
                to: this.smtpToUser,
                subject:
                    "[ SUCCESS @ SmartWorker ] - Failed job ran successfully with these changes!",
                html: html,
            });
            logger.info("Success email sent");
        } catch (e) {
            logger.error({ error: e }, "Error sending success email");
        }
    };

    sendFailedEmail = async (html: string) => {
        if (!this.transporter) {
            logger.warn("No transporter configuration - skipping failure email");
            return;
        }

        try {
            await this.transporter.sendMail({
                from: this.smtpUser,
                to: this.smtpToUser,
                subject:
                    "[ FAILURE @ SmartWorker ] - Failed job could not run successfully with these changes!",
                html: html,
            });
            logger.info("Failure email sent");
        } catch (e) {
            logger.error({ error: e }, "Error sending failure email");
        }
    };
}
