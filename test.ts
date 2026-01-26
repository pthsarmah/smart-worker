import { BoxRenderable, createCliRenderer, RGBA, SelectRenderable, SelectRenderableEvents } from "@opentui/core"

const renderer = await createCliRenderer({
	exitOnCtrlC: true,
});

const transparent = new RGBA(new Float32Array([0, 0, 0, 0]));

const menu = new SelectRenderable(renderer, {
	id: "styled-menu",
	width: 30,
	height: 2,
	backgroundColor: transparent,
	selectedBackgroundColor: transparent,
	selectedTextColor: "#f67400",
	focusedBackgroundColor: transparent,
	options: [
		{ name: "Set data hazard", description: "" },
		{ name: "Set env variable hazard", description: "" },
	],
});

menu.on(SelectRenderableEvents.ITEM_SELECTED, async (_, option) => {
	switch (option.name) {
		case "Set data hazard":
			let res = await fetch("http://localhost:9090/job", {
				method: "POST",
				body: JSON.stringify({
					name: "start-worker",
					data: 10,
				}),
				headers: { "Content-Type": "application/json " }
			});
			if (!res.ok) console.error("Setting data hazard failed", await res.text());
			break;
		case "Set env variable hazard":
			const envFile = await Bun.file(".env.docker").text();
			const newEnvText = envFile.replace(/TEST_ENV_VAR=.*\n/g, "");
			await Bun.write(".env.docker", newEnvText);
			res = await fetch("http://localhost:9090/job", {
				method: "POST",
				body: JSON.stringify({
					name: "start-worker",
					data: 30,
				}),
				headers: { "Content-Type": "application/json " }
			});
			if (!res.ok) console.error("Setting env hazard failed", await res.text());
			break;
	}
});

menu.showDescription = false;
menu.focus();

const container = new BoxRenderable(renderer, {
	id: "styled-menu-container",
	width: 32,
	height: 10,
	padding: 2,
	flexDirection: "column",
	justifyContent: "center",
	alignItems: "center",
	title: "Hazard Test",
	border: true,
	borderStyle: "single",
	titleAlignment: "left"
});

container.add(menu);
renderer.root.add(container);
