import nodemailer, { type Transporter } from 'nodemailer';

export class EmailClient {

	private static _instance: EmailClient;
	private transporter: Transporter | undefined;

	private readonly smtpUser: string | undefined;
	private readonly smtpPass: string | undefined;
	private readonly smtpToUser: string | undefined;
	private readonly smtpHost: string | undefined;

	public static get Instance() {
		return this._instance || (this._instance = new this());
	}

	constructor() {

		this.smtpUser = process.env.SMTP_USER;
		this.smtpPass = process.env.SMTP_PASS;
		this.smtpHost = process.env.SMTP_HOST;
		this.smtpToUser = process.env.SMTP_TO_USER;

		if (!this.smtpHost || !this.smtpUser || !this.smtpPass || !this.smtpToUser) {
			console.error("SMTP environment variables invalid!");
		}

		this.transporter = nodemailer.createTransport({
			host: this.smtpHost,
			port: parseInt(process.env.SMTP_PORT!),
			secure: true,
			auth: {
				user: this.smtpUser,
				pass: this.smtpPass,
			},
		});
	}

	sendSuccessEmail = async (html: string) => {

		if (!this.transporter) {
			console.error("No transporter configuration");
			return;
		}

		try {
			await this.transporter.sendMail({
				from: this.smtpUser,
				to: this.smtpToUser,
				subject: "[ ✅ SUCCESS @ SmartWorker ] - Failed job ran successfully with these changes!",
				html: html,
			});
		} catch (e: any) {
			console.log("Error sending email: ", e);
		}
	};

	sendFailedEmail = async (html: string) => {

		if (!this.transporter) {
			console.error("No transporter configuration");
			return;
		}

		try {
			await this.transporter.sendMail({
				from: this.smtpUser,
				to: this.smtpToUser,
				subject: "[ ❌ FAILURE @ SmartWorker ] - Failed job could not run successfully with these changes!",
				html: html,
			});
		} catch (e: any) {
			console.log("Error sending email: ", e);
		}
	};
};
