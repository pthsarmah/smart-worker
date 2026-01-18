import { stdout } from "process"

export function startSpinner() {
	const characters = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
	const cursorEsc = {
		hide: '\u001B[?25l',
		show: '\u001B[?25h',
	}
	stdout.write(cursorEsc.hide)

	let i = 0;
	const timer = setInterval(function() {
		stdout.write("\r" + "\x1b[33m" + characters[i++] + " Sending code to LLM for fix...");
		i = i >= characters.length ? 0 : i;
	}, 150);

	return () => {
		clearInterval(timer)
		stdout.write("\r")
		stdout.write(cursorEsc.show)
	}
}
