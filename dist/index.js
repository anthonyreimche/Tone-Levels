//#region src/model.ts
var e = [
	"value",
	"red",
	"green",
	"blue"
], t = .1, n = Object.freeze({
	lowInput: 0,
	highInput: 1,
	gamma: 1,
	lowOutput: 0,
	highOutput: 1
});
Object.freeze({
	channels: Object.freeze({
		value: n,
		red: n,
		green: n,
		blue: n
	}),
	clampInput: !1,
	clampOutput: !1,
	linear: !1
});
var r = (e, t, n) => e > n ? n : e < t ? t : e;
function i(e, t) {
	let n = e.highInput === e.lowInput ? t - e.lowInput : (t - e.lowInput) / (e.highInput - e.lowInput);
	return e.gamma !== 0 && n > 0 && (n **= 1 / e.gamma), n;
}
function a(e) {
	let t = Math.abs(e), n = t < .04045 ? t / 12.92 : ((t + .055) / 1.055) ** 2.4;
	return Math.sign(e) * n;
}
function o(e, t, n) {
	return {
		...e,
		channels: {
			...e.channels,
			[t]: n
		}
	};
}
var s = [
	"low",
	"gamma",
	"high"
];
function c(e) {
	if (e.highInput === e.lowInput) return e.lowInput;
	let t = e.lowInput * 255, n = (e.highInput * 255 - t) / 2;
	return (t + n + n * Math.log10(1 / e.gamma)) / 255;
}
function l(e, t) {
	let n = e.lowInput * 255, i = e.highInput * 255, a = r(t * 255, n, i), o = (i - n) / 2;
	if (!(o >= .5)) return null;
	let s = 1 / 10 ** ((a - (n + o)) / o);
	return Math.floor(s * 100 + .5) / 100;
}
function u(e, t) {
	let n = -1, r = Infinity;
	return e.forEach((e, i) => {
		if (e === null) return;
		let a = t - e;
		(Math.abs(a) < r || Math.abs(a) === r && a > 0) && (n = i, r = Math.abs(a));
	}), n;
}
function d(e, n, i) {
	let a = r(i, 0, 1);
	if (n === "low") return {
		...e,
		lowInput: Math.min(a, e.highInput)
	};
	if (n === "high") return {
		...e,
		highInput: Math.max(a, e.lowInput)
	};
	let o = l(e, a);
	return o === null ? e : {
		...e,
		gamma: r(o, t, 10)
	};
}
function f(e, t, n) {
	let i = r(n, 0, 1);
	return t === "low" ? {
		...e,
		lowOutput: i
	} : {
		...e,
		highOutput: i
	};
}
function p(e) {
	return [
		e.lowInput,
		c(e),
		e.highInput
	];
}
function m(e) {
	return [
		e.lowOutput,
		null,
		e.highOutput
	];
}
function h(e, t) {
	return t.width <= 0 ? 0 : r((e - t.left) / t.width, 0, 1);
}
var g = /* @__PURE__ */ new Uint8Array(256);
for (let e = 0; e < 256; e++) g[e] = Math.round(a(e / 255) * 255);
function ee(e, t, n, r) {
	let i = /* @__PURE__ */ new Float64Array(256), a = /* @__PURE__ */ new Float64Array(256), o = /* @__PURE__ */ new Float64Array(256), s = /* @__PURE__ */ new Float64Array(256);
	for (let c = 0, l = t * n; c < l; c++) {
		let t = c * 4, n = r ? g[e[t]] : e[t], l = r ? g[e[t + 1]] : e[t + 1], u = r ? g[e[t + 2]] : e[t + 2];
		a[n]++, o[l]++, s[u]++, i[Math.max(n, l, u)]++;
	}
	return {
		value: i,
		red: a,
		green: o,
		blue: s
	};
}
function te(e, t) {
	let n = 0;
	for (let t = 0; t < e.length; t++) e[t] > n && (n = e[t]);
	let r = new Float64Array(e.length), i = t === "log" ? n > 0 ? Math.log(n) : 1 : n;
	for (let n = 0; n < e.length; n++) {
		let a = e[n];
		if (a <= 0) continue;
		let o = t === "log" ? i > 0 ? Math.log(a) / i : 1 : a / i;
		r[n] = Math.max(0, o);
	}
	return r;
}
var _ = (e) => Math.round(e * 10) / 10;
function ne(e, t, n) {
	let r = e.length, i = "";
	for (let a = 0; a < r; a++) {
		let o = e[a];
		if (o <= 0) continue;
		let s = _(a * t / r), c = _((a + 1) * t / r);
		i += `M${s} ${n}V${_(n * (1 - o))}H${c}V${n}Z`;
	}
	return i;
}
//#endregion
//#region src/runtime.ts
var v = null;
function re(e) {
	v = e;
}
function y() {
	if (!v) throw Error("[tone-levels] api() called before activate()");
	return v;
}
function b(e, t, ...n) {
	return y().react.createElement(e, t, ...n);
}
//#endregion
//#region src/Bars.ts
var x = {
	value: "#ffffff",
	red: "#ff0000",
	green: "#00ff00",
	blue: "#0000ff"
}, S = (e) => Math.floor(r(e, 0, 1) * 255.999);
function ie(e, t, n = 33) {
	let r = [];
	for (let a = 0; a < n; a++) {
		let o = a / (n - 1), [s, c, l] = t === "value" ? [
			0,
			0,
			0
		].map(() => i(e.channels.value, o)) : [
			i(e.channels.red, o),
			i(e.channels.green, o),
			i(e.channels.blue, o)
		];
		r.push(`rgb(${S(s)}, ${S(c)}, ${S(l)}) ${(o * 100).toFixed(2)}%`);
	}
	return `linear-gradient(to right, ${r.join(", ")})`;
}
function ae(e) {
	return `linear-gradient(to right, #000000, ${x[e]})`;
}
var C = 64;
function oe({ bins: e, scale: t, channel: n }) {
	let { useMemo: r } = y().react, { tokens: i } = y().ui, a = n === "value" ? i.textSecondary : x[n], o = r(() => e ? ne(te(e, t), 256, C) : null, [e, t]);
	return b("svg", {
		role: "img",
		"aria-label": "Histogram",
		viewBox: `0 0 256 ${C}`,
		preserveAspectRatio: "none",
		style: {
			display: "block",
			width: "100%",
			height: C,
			background: i.surface0,
			border: `1px solid ${i.border}`,
			boxSizing: "border-box"
		}
	}, o === null ? null : b("path", {
		d: o,
		style: { fill: a }
	}));
}
function se({ background: e, label: t }) {
	return b("div", {
		role: "img",
		"aria-label": t,
		style: {
			height: 8,
			background: e,
			border: `1px solid ${y().ui.tokens.border}`
		}
	});
}
var w = [
	"#000000",
	"#808080",
	"#ffffff"
];
function ce({ label: e, positions: t, onDrag: n, onRelease: r }) {
	let { useRef: i } = y().react, { tokens: a } = y().ui, o = i(null), s = (e) => h(e.clientX, e.currentTarget.getBoundingClientRect()), c = () => {
		o.current !== null && (o.current = null, r());
	};
	return b("div", {
		role: "group",
		"aria-label": e,
		style: {
			position: "relative",
			height: 10,
			touchAction: "none"
		},
		onPointerDown: (e) => {
			if (e.button !== 0) return;
			let r = s(e), i = u(t, r);
			i < 0 || (o.current = i, e.currentTarget.setPointerCapture(e.pointerId), n(i, r));
		},
		onPointerMove: (e) => {
			o.current !== null && n(o.current, s(e));
		},
		onPointerUp: (e) => {
			o.current !== null && (e.currentTarget.releasePointerCapture(e.pointerId), c());
		},
		onLostPointerCapture: c
	}, ...t.map((e, t) => e === null ? null : b("svg", {
		key: t,
		"data-handle": t,
		"data-pos": e,
		width: 10,
		height: 9,
		viewBox: "0 0 10 9",
		style: {
			position: "absolute",
			top: 0,
			left: `${e * 100}%`,
			marginLeft: -5,
			overflow: "visible",
			pointerEvents: "none"
		}
	}, b("path", {
		d: "M5 0.5L9.5 8.5H0.5Z",
		style: {
			fill: w[t],
			stroke: a.textSecondary,
			strokeWidth: 1
		}
	}))));
}
//#endregion
//#region src/params.ts
var T = "tone-levels", E = `${T}.levels`, D = [
	"LowInput",
	"HighInput",
	"Gamma",
	"LowOutput",
	"HighOutput"
], O = [
	"clampInput",
	"clampOutput",
	"linear"
], k = {
	LowInput: "lowInput",
	HighInput: "highInput",
	Gamma: "gamma",
	LowOutput: "lowOutput",
	HighOutput: "highOutput"
}, A = {
	LowInput: {
		min: 0,
		max: 1,
		step: .001,
		label: "low input"
	},
	HighInput: {
		min: 0,
		max: 1,
		step: .001,
		label: "high input"
	},
	Gamma: {
		min: t,
		max: 10,
		step: .01,
		label: "gamma"
	},
	LowOutput: {
		min: 0,
		max: 1,
		step: .001,
		label: "low output"
	},
	HighOutput: {
		min: 0,
		max: 1,
		step: .001,
		label: "high output"
	}
}, j = {
	value: "Value",
	red: "Red",
	green: "Green",
	blue: "Blue"
}, M = {
	clampInput: "Clamp input",
	clampOutput: "Clamp output",
	linear: "Linear"
}, N = (e, t) => `${e}${t}`, P = [...e.flatMap((e) => D.map((t) => ({
	key: N(e, t),
	default: n[k[t]],
	min: A[t].min,
	max: A[t].max,
	step: A[t].step,
	label: `${j[e]} ${A[t].label}`
}))), ...O.map((e) => ({
	key: e,
	default: 0,
	min: 0,
	max: 1,
	step: 1,
	label: M[e]
}))];
P.map((e) => e.key);
var F = new Map(P.map((e) => [e.key, e])), I = (e) => `${E}.${e}`;
function L(e, t) {
	let n = F.get(t);
	if (!n) throw Error(`[tone-levels] unknown key ${t}`);
	let i = e[I(t)];
	return typeof i == "number" && Number.isFinite(i) ? r(i, n.min, n.max) : n.default;
}
function R(e) {
	let t = (t) => ({
		lowInput: L(e, N(t, "LowInput")),
		highInput: L(e, N(t, "HighInput")),
		gamma: L(e, N(t, "Gamma")),
		lowOutput: L(e, N(t, "LowOutput")),
		highOutput: L(e, N(t, "HighOutput"))
	});
	return {
		channels: {
			value: t("value"),
			red: t("red"),
			green: t("green"),
			blue: t("blue")
		},
		clampInput: L(e, "clampInput") > .5,
		clampOutput: L(e, "clampOutput") > .5,
		linear: L(e, "linear") > .5
	};
}
function le(t) {
	let n = {};
	for (let r of e) for (let e of D) n[I(N(r, e))] = t.channels[r][k[e]];
	return n[I("clampInput")] = +!!t.clampInput, n[I("clampOutput")] = +!!t.clampOutput, n[I("linear")] = +!!t.linear, n;
}
function z() {
	let e = {};
	for (let t of P) e[I(t.key)] = t.default;
	return e;
}
//#endregion
//#region src/store.ts
var B = null;
function V() {
	B = y().stores.create((e) => ({
		frame: null,
		channel: "value",
		scale: "linear",
		picking: null,
		setFrame: (t) => e({ frame: t }),
		setChannel: (t) => e({ channel: t }),
		setScale: (t) => e({ scale: t }),
		setPicking: (t) => e({ picking: t })
	}));
}
function H() {
	if (!B) throw Error("[tone-levels] store() called before activate()");
	return B;
}
var ue = `${E}.`;
function U(e) {
	if (!e.photoId) return null;
	let t = {};
	for (let n of Object.keys(e.paramBag)) n.startsWith(ue) || (t[n] = e.paramBag[n]);
	return {
		photoId: e.photoId,
		params: e.previewParams ?? e.params,
		bag: t
	};
}
function W(e, t) {
	if (e.photoId !== t.photoId || e.params !== t.params) return !1;
	let n = Object.keys(e.bag);
	return n.length === Object.keys(t.bag).length && n.every((n) => Object.prototype.hasOwnProperty.call(t.bag, n) && e.bag[n] === t.bag[n]);
}
function G(e) {
	let t = y(), n = t.stores.useDevelopStore.getState();
	return t.develop.captureFrame(e ?? n.previewParams ?? n.params, { paramBag: z() });
}
function K(e) {
	let t = y(), n = t.stores.useDevelopStore.getState();
	return n.photoId ? t.develop.renderPhotoFrame(n.photoId, e ?? n.previewParams ?? n.params, {
		...n.paramBag,
		...z()
	}) : Promise.resolve(null);
}
var q = null;
function de(e, t) {
	return q ??= new OffscreenCanvas(e, t), q.width !== e && (q.width = e), q.height !== t && (q.height = t), q.getContext("2d", { willReadFrequently: !0 });
}
function fe(e, t = 640) {
	let { width: n, height: r } = e;
	if (n < 2 || r < 2) return null;
	let i = Math.min(1, t / Math.max(n, r)), a = Math.max(1, Math.round(n * i)), o = Math.max(1, Math.round(r * i)), s = de(a, o);
	return s ? (s.clearRect(0, 0, a, o), s.drawImage(e, 0, 0, a, o), {
		data: s.getImageData(0, 0, a, o).data,
		width: a,
		height: o
	}) : null;
}
async function pe() {
	let e = U(y().stores.useDevelopStore.getState());
	if (!e) return null;
	let t = await K();
	if (!t) return null;
	try {
		let n = fe(t);
		return n ? {
			photoId: e.photoId,
			readback: n,
			signature: e
		} : null;
	} finally {
		t.close();
	}
}
function me(e) {
	let t = e.throttleMs ?? 150, n = !1, r = !1, i = !1, a = null, o = -Infinity, s = null, c = e.develop.getState(), l = !1, u = (t) => {
		s = t?.signature ?? null, e.publish(t);
	}, d = (e) => {
		let t = U(e), n = U(c);
		return e.paramBag !== c.paramBag && !!t && !!n && W(t, n);
	}, f = () => {
		a = null;
		let t = e.develop.getState(), d = U(t);
		if (n || !d || !l && s && W(s, d)) return;
		l = !1, c = t;
		let f = d.photoId, m = () => !n && e.develop.getState().photoId === f;
		r = !0, o = Date.now(), e.capture(d.params).then((t) => {
			if (!t) {
				m() && u(null);
				return;
			}
			try {
				if (m()) {
					let n = e.readback(t);
					u(n ? {
						photoId: f,
						readback: n,
						signature: d
					} : null);
				}
			} finally {
				t.close();
			}
		}).catch((e) => {
			console.warn("[tone-levels] histogram capture failed:", e), m() && u(null);
		}).finally(() => {
			r = !1, i && !n && (i = !1, p());
		});
	}, p = () => {
		if (!n) {
			if (r) {
				i = !0;
				return;
			}
			a === null && (a = setTimeout(f, Math.max(0, t - (Date.now() - o))));
		}
	}, m = e.develop.subscribe((e, t) => {
		if (e.photoId !== t.photoId && !e.photoId) {
			i = !1, a !== null && (clearTimeout(a), a = null), u(null);
			return;
		}
		e.photoId && (e.histogram !== t.histogram || e.photoId !== t.photoId) && (d(e) || (l = !0), c = e, p());
	});
	return p(), () => {
		n = !0, m(), a !== null && clearTimeout(a), a = null;
	};
}
function he() {
	return me({
		develop: y().stores.useDevelopStore,
		capture: (e) => K(e),
		readback: (e) => fe(e),
		publish: (e) => H().getState().setFrame(e)
	});
}
var J = [
	.2224884,
	.71690369,
	.06060791
], ge = [
	"red",
	"green",
	"blue"
];
function _e(e, t) {
	let n = t.length, r = 0;
	for (let e = 0; e < n; e++) r += t[e];
	let i = {
		...e,
		gamma: 1,
		lowOutput: 0,
		highOutput: 1
	};
	if (r === 0) return {
		...i,
		lowInput: 0,
		highInput: 0
	};
	let a = e.lowInput, o = 0;
	for (let e = 0; e < n - 1; e++) {
		o += t[e];
		let i = o / r, s = (o + t[e + 1]) / r;
		if (Math.abs(i - .006) < Math.abs(s - .006)) {
			a = (e + 1) / (n - 1);
			break;
		}
	}
	let s = e.highInput;
	o = 0;
	for (let e = n - 1; e > 0; e--) {
		o += t[e];
		let i = o / r, a = (o + t[e - 1]) / r;
		if (Math.abs(i - .006) < Math.abs(a - .006)) {
			s = (e - 1) / (n - 1);
			break;
		}
	}
	return {
		...i,
		lowInput: a,
		highInput: s
	};
}
function ve(e, t) {
	let r = o(e, "value", n);
	for (let e of ge) r = o(r, e, _e(r.channels[e], t[e]));
	return r;
}
function Y(e, t) {
	switch (e) {
		case "value": return Math.max(Math.max(t[0], t[1]), t[2]);
		case "red": return t[0];
		case "green": return t[1];
		case "blue": return t[2];
	}
}
function ye(e, n, i, a) {
	if (i === "black") return {
		...e,
		lowInput: Y(n, a)
	};
	if (i === "white") return {
		...e,
		highInput: Y(n, a)
	};
	let o = a[0] * J[0] + a[1] * J[1] + a[2] * J[2], s = e.highInput - e.lowInput;
	if (s <= 0) return e;
	let c = Y(n, a) - e.lowInput;
	if (c < 0) return e;
	let l = c / s, u = o / s;
	return u <= 1e-4 || u >= .9999 ? e : {
		...e,
		gamma: r(Math.log(l) / Math.log(u), t, 10)
	};
}
function be(e, t, n, r, i) {
	if (n === "channel") return o(e, r, ye(e.channels[r], r, t, i));
	let a = e.channels.value, s = o(e, "value", t === "black" ? {
		...a,
		lowInput: 0
	} : t === "grey" ? {
		...a,
		gamma: 1
	} : {
		...a,
		highInput: 1
	});
	for (let e of ge) s = o(s, e, ye(s.channels[e], e, t, i));
	return s;
}
function xe(e, t) {
	return o(e, t, n);
}
//#endregion
//#region src/Panel.ts
var Se = {
	value: "Value",
	red: "Red",
	green: "Green",
	blue: "Blue"
}, Ce = {
	black: "#000000",
	grey: "#808080",
	white: "#ffffff"
}, X = {
	black: "Black",
	grey: "Grey",
	white: "White"
}, we = {
	channel: {
		black: "Pick black point for the selected channel",
		grey: "Pick grey point for the selected channel",
		white: "Pick white point for the selected channel"
	},
	all: {
		black: "Pick black point for all channels",
		grey: "Pick grey point for all channels",
		white: "Pick white point for all channels"
	}
}, Te = (t) => e.find((e) => e === t) ?? "value", Z = (e) => Math.round(e * 255 * 10) / 10;
function Ee() {
	let { useEffect: n, useMemo: i, useRef: a, useState: c } = y().react, { Button: l, NumberInput: u, Row: h, Section: g, SegmentedControl: te, Select: _, Stack: ne, Toggle: v, tokens: re } = y().ui, x = y().stores.useDevelopStore, S = x((e) => e.paramBag), C = x((e) => e.photoId), w = H()((e) => e.frame), T = H()((e) => e.channel), E = H()((e) => e.scale), D = H()((e) => e.picking), O = a(null), [k, A] = c(null);
	n(() => he(), []);
	let j = R(S), M = j.channels[T], N = w && w.photoId === C ? w.readback : null, P = i(() => N ? ee(N.data, N.width, N.height, j.linear) : null, [N, j.linear]), F = () => R(x.getState().paramBag), I = (e) => x.getState().setDynParams(le(e)), L = (e) => void x.getState().commitEdit(`Tone Levels ${e}`), z = (e) => {
		let t = F();
		I(o(t, T, e(t.channels[T])));
	}, B = (e) => {
		let t = O.current;
		t?.label === e && (O.current = null, A(null), z((e) => t.set(e, t.value)), L(e.toLowerCase()));
	}, V = (e, t, n, r) => b(u, {
		"aria-label": e,
		title: e,
		value: k?.label === e ? k.value : t,
		step: n,
		width: "52px",
		onChange: (t) => {
			O.current = {
				label: e,
				value: t,
				set: r
			}, A({
				label: e,
				value: t
			});
		},
		onBlur: () => B(e),
		onKeyDown: (t) => {
			t.key === "Enter" && B(e);
		}
	}), ue = (e) => b("span", { style: {
		display: "inline-block",
		width: 9,
		height: 9,
		marginRight: 4,
		verticalAlign: "-1px",
		background: Ce[e],
		border: `1px solid ${re.border}`
	} }), G = (e, t, n) => {
		let r = D?.point === e && D.scope === t;
		return b(l, {
			size: "sm",
			active: r,
			"aria-pressed": r,
			title: `${we[t][e]} (Esc cancels)`,
			"aria-label": we[t][e],
			onClick: () => H().getState().setPicking(r ? null : {
				point: e,
				scope: t
			})
		}, ue(e), n ?? null);
	}, K = async () => {
		let e = U(x.getState());
		if (!e) return;
		let t = H().getState().frame, n = t && W(t.signature, e) ? t.readback : null;
		if (!n) {
			let e = await pe(), t = U(x.getState());
			if (!e || !t || !W(e.signature, t)) return;
			n = e.readback;
		}
		let r = F();
		I(ve(r, ee(n.data, n.width, n.height, r.linear))), L("auto input levels");
	}, q = (...e) => b("div", { style: {
		padding: "0 5px",
		display: "flex",
		flexDirection: "column",
		gap: 2
	} }, ...e);
	return b(ne, {
		gap: 10,
		style: { padding: "6px 8px 8px" }
	}, b(h, { gap: 6 }, b("div", { style: {
		flex: "1 1 auto",
		minWidth: 0
	} }, b(_, {
		value: T,
		ariaLabel: "Channel",
		options: e.map((e) => ({
			value: e,
			label: Se[e]
		})),
		onChange: (e) => H().getState().setChannel(Te(e))
	})), b(l, {
		size: "sm",
		title: "Reset this channel's levels",
		onClick: () => {
			I(xe(F(), T)), L("reset channel");
		}
	}, "Reset Channel")), b(h, { gap: 6 }, b("div", { style: { flex: "1 1 auto" } }, b(te, {
		size: "sm",
		value: j.linear ? "linear" : "perceptual",
		options: [{
			value: "perceptual",
			label: "Perceptual",
			title: "Work on display-encoded values"
		}, {
			value: "linear",
			label: "Linear",
			title: "Work on linear light"
		}],
		onChange: (e) => {
			let t = e === "linear";
			t !== F().linear && (I({
				...F(),
				linear: t
			}), L(t ? "linear" : "perceptual"));
		}
	})), b(te, {
		size: "sm",
		value: E,
		options: [{
			value: "linear",
			label: "Lin",
			title: "Linear histogram"
		}, {
			value: "log",
			label: "Log",
			title: "Logarithmic histogram"
		}],
		onChange: (e) => H().getState().setScale(e === "log" ? "log" : "linear")
	})), b(g, { title: "Input Levels" }, q(b(oe, {
		bins: P ? P[T] : null,
		scale: E,
		channel: T
	}), b(se, {
		background: ie(j, T),
		label: "Input levels"
	}), b(ce, {
		label: "Input levels handles",
		positions: p(M),
		onDrag: (e, t) => z((n) => d(n, s[e], t)),
		onRelease: () => L("input levels")
	})), b(h, {
		gap: 4,
		justify: "space-between"
	}, b(h, { gap: 2 }, G("black", "channel"), V("Low input", Z(M.lowInput), 1, (e, t) => ({
		...e,
		lowInput: r(t / 255, 0, e.highInput)
	}))), V("Gamma", Math.round(M.gamma * 100) / 100, .01, (e, n) => ({
		...e,
		gamma: r(n, t, 10)
	})), b(h, { gap: 2 }, V("High input", Z(M.highInput), 1, (e, t) => ({
		...e,
		highInput: r(t / 255, e.lowInput, 1)
	})), G("white", "channel"))), b(v, {
		checked: j.clampInput,
		label: "Clamp input",
		onChange: (e) => {
			I({
				...F(),
				clampInput: e
			}), L("clamp input");
		}
	})), b(g, { title: "Output Levels" }, q(b(se, {
		background: ae(T),
		label: "Output levels"
	}), b(ce, {
		label: "Output levels handles",
		positions: m(M),
		onDrag: (e, t) => z((n) => f(n, e === 0 ? "low" : "high", t)),
		onRelease: () => L("output levels")
	})), b(h, {
		gap: 4,
		justify: "space-between"
	}, V("Low output", Z(M.lowOutput), 1, (e, t) => ({
		...e,
		lowOutput: r(t / 255, 0, 1)
	})), V("High output", Z(M.highOutput), 1, (e, t) => ({
		...e,
		highOutput: r(t / 255, 0, 1)
	}))), b(v, {
		checked: j.clampOutput,
		label: "Clamp output",
		onChange: (e) => {
			I({
				...F(),
				clampOutput: e
			}), L("clamp output");
		}
	})), b(g, { title: "All Channels" }, b(l, {
		size: "sm",
		full: !0,
		title: "Adjust levels for all channels automatically",
		onClick: () => void K()
	}, "Auto Input Levels"), b(h, { gap: 4 }, G("black", "all", X.black), G("grey", "all", X.grey), G("white", "all", X.white))));
}
//#endregion
//#region src/picker.ts
function De(e, t, n, r, i) {
	if (!i || n.width <= 0 || n.height <= 0 || i.w <= 0 || i.h <= 0) return null;
	let a = r / n.width, o = ((e - n.left) * a - i.x) / i.w, s = ((t - n.top) * a - i.y) / i.h;
	return o < 0 || o > 1 || s < 0 || s > 1 ? null : {
		x: o,
		y: s
	};
}
function Oe(e, t, n, r, i, o) {
	let s = [
		0,
		0,
		0
	], c = 0;
	for (let l = Math.max(0, i - 2); l <= Math.min(n - 1, i + 2); l++) for (let n = Math.max(0, r - 2); n <= Math.min(t - 1, r + 2); n++) {
		let r = (l * t + n) * 4;
		for (let t = 0; t < 3; t++) {
			let n = e[r + t] / 255;
			s[t] += o ? a(n) : n;
		}
		c++;
	}
	return c === 0 ? null : [
		s[0] / c,
		s[1] / c,
		s[2] / c
	];
}
var ke = {
	black: "black point",
	grey: "grey point",
	white: "white point"
};
function Ae(e, t) {
	let n = y().stores.useDevelopStore.getState(), r = H().getState(), i = R(n.paramBag);
	n.setDynParams(le(be(i, e.point, e.scope, r.channel, t))), n.commitEdit(`Tone Levels pick ${ke[e.point]}`), r.setPicking(null);
}
function je(e, t) {
	try {
		let { width: n, height: r } = e;
		if (n < 2 || r < 2) return null;
		let i = Math.min(n - 1, Math.floor(t.x * n)), a = Math.min(r - 1, Math.floor(t.y * r)), o = Math.max(0, i - 2), s = Math.max(0, a - 2), c = Math.min(n - 1, i + 2) - o + 1, l = Math.min(r - 1, a + 2) - s + 1, u = new OffscreenCanvas(c, l).getContext("2d", { willReadFrequently: !0 });
		return u ? (u.drawImage(e, o, s, c, l, 0, 0, c, l), {
			data: u.getImageData(0, 0, c, l).data,
			width: c,
			height: l,
			cx: i - o,
			cy: a - s
		}) : null;
	} finally {
		e.close();
	}
}
function Me(e, t) {
	return H().getState().picking === e && y().stores.useDevelopStore.getState().photoId === t;
}
async function Ne(e, t, n, r, i) {
	try {
		if (!n) return;
		let a = y().stores.useDevelopStore.getState().photoId, o = De(e, t, n.getBoundingClientRect(), n.clientWidth, r);
		if (!o) return;
		let s = je(await G(), o);
		if (!s || !Me(i, a)) return;
		let { linear: c } = R(y().stores.useDevelopStore.getState().paramBag), l = Oe(s.data, s.width, s.height, s.cx, s.cy, c);
		l && Ae(i, l);
	} catch (e) {
		console.warn("[tone-levels] pick failed:", e);
	}
}
function Pe() {
	let { useEffect: e, useRef: t } = y().react, n = H()((e) => e.picking), r = y().stores.useDevelopStore((e) => e.cropping), i = y().stores.useDevelopStore((e) => e.activeTool), a = y().stores.useDevelopStore((e) => e.wbPicking), o = y().stores.useDevelopStore((e) => e.hslPicking), s = y().develop.useDevelopOverlay(), c = t(null);
	return e(() => {
		if (n === null) return;
		let e = (e) => {
			e.key === "Escape" && H().getState().setPicking(null);
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [n]), n === null || r || i !== "none" || a || o ? null : b("div", {
		ref: c,
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: "auto",
			cursor: y().cursors.resolve("pick")
		},
		onPointerDown: (e) => {
			e.button !== 0 || e.ctrlKey || e.metaKey || (e.preventDefault(), Ne(e.clientX, e.clientY, c.current, s.rect, n));
		}
	});
}
//#endregion
//#region src/stage.ts
function Q(e) {
	let t = e.toPrecision(10);
	if (!t.includes("e")) return t.includes(".") ? t : `${t}.0`;
	let [n, r] = t.split("e");
	return `${n.includes(".") ? n : `${n}.0`}e${r}`;
}
var Fe = "\nfloat tlMap(float v, float lo, float hi, float ci, float ig, float olo, float ohi, float co) {\n  v = hi != lo ? (v - lo) / (hi - lo) : v - lo;\n  if (ci > 0.5) v = clamp(v, 0.0, 1.0);\n  if (ig != 1.0 && v > 0.0) v = pow(v, ig);\n  v = ohi >= olo ? v * (ohi - olo) + olo : olo - v * (olo - ohi);\n  if (co > 0.5) v = clamp(v, 0.0, 1.0);\n  return v;\n}\nvec3 tlDecode(vec3 y) {\n  vec3 a = abs(y);\n  return sign(y) * mix(a / 12.92, pow((a + 0.055) / 1.055, vec3(2.4)), step(0.04045, a));\n}\nvec3 tlEncode(vec3 x) {\n  vec3 a = abs(x);\n  return sign(x) * mix(a * 12.92, 1.055 * pow(a, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, a));\n}\n", Ie = (e) => {
	let t = P.find((t) => t.key === e);
	if (!t) throw Error(`[tone-levels] no spec for ${e}`);
	return `clamp(${e}, ${Q(t.min)}, ${Q(t.max)})`;
}, $ = (e, t) => {
	let n = (t) => Ie(`${e}${t}`);
	return `tlMap(${t}, ${n("LowInput")}, ${n("HighInput")}, clampInput, 1.0 / ${n("Gamma")}, ${n("LowOutput")}, ${n("HighOutput")}, clampOutput)`;
}, Le = `
{
  if (${P.map((e) => `${e.key} != ${Q(e.default)}`).join(" || ")}) {
    vec3 v = linear > 0.5 ? tlDecode(c) : c;
    v = vec3(${$("red", "v.r")}, ${$("green", "v.g")}, ${$("blue", "v.b")});
    v = vec3(${$("value", "v.r")}, ${$("value", "v.g")}, ${$("value", "v.b")});
    c = linear > 0.5 ? tlEncode(v) : v;
  }
}
`;
function Re() {
	return P.map((e) => ({
		key: e.key,
		glslType: "float",
		default: e.default,
		range: {
			min: e.min,
			max: e.max,
			step: e.step
		},
		label: e.label
	}));
}
function ze() {
	return {
		id: E,
		name: "Tone Levels",
		phase: "display-adjust",
		glsl: Le,
		helpers: Fe,
		uniforms: Re(),
		presetScope: "global",
		space: { encoding: "perceptual" }
	};
}
//#endregion
//#region src/index.ts
var Be = `${T}.panel`, Ve = `${T}.picker`, He = null;
function Ue() {
	let e = y().stores.useDevelopStore.getState();
	e.setDynParams(z()), e.commitEdit("Tone Levels reset");
}
function We(e) {
	re(e), V(), He = e, e.registerProcessingStage(ze()), e.registerPanel({
		id: Be,
		title: "Tone Levels",
		component: Ee,
		defaultDock: {
			module: "develop",
			direction: "right",
			order: 6.5,
			width: 268
		},
		onReset: Ue
	}), e.registerSlot({
		id: Ve,
		slot: "develop-canvas-overlay",
		component: Pe,
		order: 60
	});
}
function Ge() {
	let e = He;
	if (e) {
		He = null;
		try {
			H().getState().setPicking(null), e.unregisterProcessingStage(E), e.unregisterSlot(Ve);
		} catch (e) {
			console.warn("[tone-levels] deactivate failed:", e);
		}
	}
}
//#endregion
export { We as activate, Ge as deactivate };

//# sourceMappingURL=index.js.map