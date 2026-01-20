import nodemailer, { type Transporter } from 'nodemailer';

export class EmailClient {

	private static _instance: EmailClient;
	private transporter: Transporter;

	public static get Instance() {
		return this._instance || (this._instance = new this());
	}

	constructor() {
		this.transporter = nodemailer.createTransport({
			host: process.env.SMTP_HOST,
			port: parseInt(process.env.SMTP_PORT!),
			secure: true,
			auth: {
				user: process.env.SMTP_USER,
				pass: process.env.SMTP_PASS,
			},
		});
	}

	sendSuccessEmail = async (html: string) => {
		try {
			await this.transporter.sendMail({
				from: process.env.SMTP_USER,
				to: process.env.SMTP_TO_USER,
				subject: "[ ✅ SUCCESS @ SmartWorker ] - Failed job ran successfully with these changes!",
				html: html,
			});
		} catch (e: any) {
			console.log("Error sending email: ", e);
		}
	};

	sendFailedEmail = async (html: string) => {
		try {
			await this.transporter.sendMail({
				from: process.env.SMTP_USER,
				to: process.env.SMTP_TO_USER,
				subject: "[ ❌ FAILURE @ SmartWorker ] - Failed job could not run successfully with these changes!",
				html: html,
			});
		} catch (e: any) {
			console.log("Error sending email: ", e);
		}
	};
};
