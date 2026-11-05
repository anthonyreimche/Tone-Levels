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
//#endregion
//#region src/params.ts
var s = "tone-levels", c = `${s}.levels`, l = [
	"LowInput",
	"HighInput",
	"Gamma",
	"LowOutput",
	"HighOutput"
], u = [
	"clampInput",
	"clampOutput",
	"linear"
], d = {
	LowInput: "lowInput",
	HighInput: "highInput",
	Gamma: "gamma",
	LowOutput: "lowOutput",
	HighOutput: "highOutput"
}, f = {
	min: 0,
	max: 1
}, p = {
	min: -64,
	max: 64
}, m = {
	LowInput: {
		...f,
		full: p,
		step: .001,
		label: "low input"
	},
	HighInput: {
		...f,
		full: p,
		step: .001,
		label: "high input"
	},
	Gamma: {
		min: t,
		max: 10,
		full: {
			min: t,
			max: 10
		},
		step: .01,
		label: "gamma"
	},
	LowOutput: {
		...f,
		full: f,
		step: .001,
		label: "low output"
	},
	HighOutput: {
		...f,
		full: f,
		step: .001,
		label: "high output"
	}
}, h = {
	value: "Value",
	red: "Red",
	green: "Green",
	blue: "Blue"
}, ee = {
	clampInput: "Clamp input",
	clampOutput: "Clamp output",
	linear: "Linear"
}, g = (e, t) => `${e}${t}`, _ = [...e.flatMap((e) => l.map((t) => ({
	key: g(e, t),
	default: n[d[t]],
	min: m[t].min,
	max: m[t].max,
	full: m[t].full,
	step: m[t].step,
	label: `${h[e]} ${m[t].label}`
}))), ...u.map((e) => ({
	key: e,
	default: 0,
	...f,
	full: f,
	step: 1,
	label: ee[e]
}))], v = _.map((e) => e.key), te = new Map(_.map((e) => [e.key, e])), y = (e) => `${c}.${e}`;
function ne(e) {
	let t = e.processVersion;
	return typeof t == "number" && Number.isFinite(t) ? t : 1;
}
var b = (e, t) => t >= 2 ? e.full : e, re = (e) => e >= 2 ? p : f;
function x(e, t, n) {
	let i = te.get(t);
	if (!i) throw Error(`[tone-levels] unknown key ${t}`);
	let a = e[y(t)], { min: o, max: s } = b(i, n);
	return typeof a == "number" && Number.isFinite(a) ? r(a, o, s) : i.default;
}
function S(e, t = 1) {
	let n = (n) => ({
		lowInput: x(e, g(n, "LowInput"), t),
		highInput: x(e, g(n, "HighInput"), t),
		gamma: x(e, g(n, "Gamma"), t),
		lowOutput: x(e, g(n, "LowOutput"), t),
		highOutput: x(e, g(n, "HighOutput"), t)
	});
	return {
		channels: {
			value: n("value"),
			red: n("red"),
			green: n("green"),
			blue: n("blue")
		},
		clampInput: x(e, "clampInput", t) > .5,
		clampOutput: x(e, "clampOutput", t) > .5,
		linear: x(e, "linear", t) > .5
	};
}
function ie(t) {
	let n = {};
	for (let r of e) for (let e of l) n[y(g(r, e))] = t.channels[r][d[e]];
	return n[y("clampInput")] = +!!t.clampInput, n[y("clampOutput")] = +!!t.clampOutput, n[y("linear")] = +!!t.linear, n;
}
function C() {
	let e = {};
	for (let t of _) e[y(t.key)] = t.default;
	return e;
}
var ae = [
	"low",
	"gamma",
	"high"
];
function w(e) {
	if (e.highInput === e.lowInput) return e.lowInput;
	let t = e.lowInput * 255, n = (e.highInput * 255 - t) / 2;
	return (t + n + n * Math.log10(1 / e.gamma)) / 255;
}
function T(e, t) {
	let n = e.lowInput * 255, i = e.highInput * 255, a = r(t * 255, n, i), o = (i - n) / 2;
	if (!(o >= .5)) return null;
	let s = 1 / 10 ** ((a - (n + o)) / o);
	return Math.floor(s * 100 + .5) / 100;
}
function E(e, t) {
	let n = -1, r = Infinity;
	return e.forEach((e, i) => {
		if (e === null) return;
		let a = t - e;
		(Math.abs(a) < r || Math.abs(a) === r && a > 0) && (n = i, r = Math.abs(a));
	}), n;
}
function oe(e, n, i, a = f) {
	let o = r(i, a.min, a.max);
	if (n === "low") return {
		...e,
		lowInput: Math.min(o, e.highInput)
	};
	if (n === "high") return {
		...e,
		highInput: Math.max(o, e.lowInput)
	};
	let s = T(e, o);
	return s === null ? e : {
		...e,
		gamma: r(s, t, 10)
	};
}
function se(e, t, n) {
	let i = r(n, 0, 1);
	return t === "low" ? {
		...e,
		lowOutput: i
	} : {
		...e,
		highOutput: i
	};
}
function ce(e) {
	return [
		e.lowInput,
		w(e),
		e.highInput
	];
}
function le(e) {
	return [
		e.lowOutput,
		null,
		e.highOutput
	];
}
function ue(e) {
	return {
		min: Math.min(0, e.lowInput, e.highInput),
		max: Math.max(1, e.lowInput, e.highInput)
	};
}
var D = (e, t) => (t - e.min) / (e.max - e.min), O = (e, t) => e.min + t * (e.max - e.min);
function k(e, t) {
	return t.width <= 0 ? 0 : r((e - t.left) / t.width, 0, 1);
}
var A = /* @__PURE__ */ new Uint8Array(256);
for (let e = 0; e < 256; e++) A[e] = Math.round(a(e / 255) * 255);
function de(e, t, n, r) {
	let i = /* @__PURE__ */ new Float64Array(256), a = /* @__PURE__ */ new Float64Array(256), o = /* @__PURE__ */ new Float64Array(256), s = /* @__PURE__ */ new Float64Array(256);
	for (let c = 0, l = t * n; c < l; c++) {
		let t = c * 4, n = r ? A[e[t]] : e[t], l = r ? A[e[t + 1]] : e[t + 1], u = r ? A[e[t + 2]] : e[t + 2];
		a[n]++, o[l]++, s[u]++, i[Math.max(n, l, u)]++;
	}
	return {
		value: i,
		red: a,
		green: o,
		blue: s
	};
}
function j(e, t) {
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
var M = (e) => Math.round(e * 10) / 10;
function N(e, t, n) {
	let r = e.length, i = "";
	for (let a = 0; a < r; a++) {
		let o = e[a];
		if (o <= 0) continue;
		let s = M(a * t / r), c = M((a + 1) * t / r);
		i += `M${s} ${n}V${M(n * (1 - o))}H${c}V${n}Z`;
	}
	return i;
}
//#endregion
//#region src/runtime.ts
var P = null;
function F(e) {
	P = e;
}
function I() {
	if (!P) throw Error("[tone-levels] api() called before activate()");
	return P;
}
function L(e, t, ...n) {
	return I().react.createElement(e, t, ...n);
}
//#endregion
//#region src/Bars.ts
var R = {
	value: "#ffffff",
	red: "#ff0000",
	green: "#00ff00",
	blue: "#0000ff"
}, z = (e) => Math.floor(r(e, 0, 1) * 255.999);
function fe(e, t, n = f, r = 33) {
	let a = [];
	for (let o = 0; o < r; o++) {
		let s = o / (r - 1), c = O(n, s), [l, u, d] = t === "value" ? [
			0,
			0,
			0
		].map(() => i(e.channels.value, c)) : [
			i(e.channels.red, c),
			i(e.channels.green, c),
			i(e.channels.blue, c)
		];
		a.push(`rgb(${z(l)}, ${z(u)}, ${z(d)}) ${(s * 100).toFixed(2)}%`);
	}
	return `linear-gradient(to right, ${a.join(", ")})`;
}
function pe(e) {
	return `linear-gradient(to right, #000000, ${R[e]})`;
}
var B = 64;
function me({ bins: e, scale: t, channel: n, axis: r = f }) {
	let { useMemo: i } = I().react, { tokens: a } = I().ui, o = n === "value" ? a.textSecondary : R[n], s = i(() => e ? N(j(e, t), 256, B) : null, [e, t]);
	return L("svg", {
		role: "img",
		"aria-label": "Histogram",
		viewBox: `${r.min * 256} 0 ${(r.max - r.min) * 256} ${B}`,
		preserveAspectRatio: "none",
		style: {
			display: "block",
			width: "100%",
			height: B,
			background: a.surface0,
			border: `1px solid ${a.border}`,
			boxSizing: "border-box"
		}
	}, s === null ? null : L("path", {
		d: s,
		style: { fill: o }
	}));
}
function he({ background: e, label: t }) {
	return L("div", {
		role: "img",
		"aria-label": t,
		style: {
			height: 8,
			background: e,
			border: `1px solid ${I().ui.tokens.border}`
		}
	});
}
var V = [
	"#000000",
	"#808080",
	"#ffffff"
];
function ge({ label: e, positions: t, axis: n = f, onDrag: r, onRelease: i }) {
	let { useRef: a } = I().react, { tokens: o } = I().ui, s = a(null), c = (e) => O(n, k(e.clientX, e.currentTarget.getBoundingClientRect())), l = () => {
		s.current !== null && (s.current = null, i());
	};
	return L("div", {
		role: "group",
		"aria-label": e,
		style: {
			position: "relative",
			height: 10,
			touchAction: "none"
		},
		onPointerDown: (e) => {
			if (e.button !== 0) return;
			let n = c(e), i = E(t, n);
			i < 0 || (s.current = i, e.currentTarget.setPointerCapture(e.pointerId), r(i, n));
		},
		onPointerMove: (e) => {
			s.current !== null && r(s.current, c(e));
		},
		onPointerUp: (e) => {
			s.current !== null && (e.currentTarget.releasePointerCapture(e.pointerId), l());
		},
		onLostPointerCapture: l
	}, ...t.map((e, t) => e === null ? null : L("svg", {
		key: t,
		"data-handle": t,
		"data-pos": e,
		width: 10,
		height: 9,
		viewBox: "0 0 10 9",
		style: {
			position: "absolute",
			top: 0,
			left: `${D(n, e) * 100}%`,
			marginLeft: -5,
			overflow: "visible",
			pointerEvents: "none"
		}
	}, L("path", {
		d: "M5 0.5L9.5 8.5H0.5Z",
		style: {
			fill: V[t],
			stroke: o.textSecondary,
			strokeWidth: 1
		}
	}))));
}
//#endregion
//#region src/store.ts
var H = null;
function U() {
	H = I().stores.create((e) => ({
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
function W() {
	if (!H) throw Error("[tone-levels] store() called before activate()");
	return H;
}
var G = `${c}.`;
function K(e) {
	if (!e.photoId) return null;
	let t = {};
	for (let n of Object.keys(e.paramBag)) n.startsWith(G) || (t[n] = e.paramBag[n]);
	return {
		photoId: e.photoId,
		params: e.previewParams ?? e.params,
		bag: t
	};
}
function q(e, t) {
	if (e.photoId !== t.photoId || e.params !== t.params) return !1;
	let n = Object.keys(e.bag);
	return n.length === Object.keys(t.bag).length && n.every((n) => Object.prototype.hasOwnProperty.call(t.bag, n) && e.bag[n] === t.bag[n]);
}
function _e(e) {
	let t = I(), n = t.stores.useDevelopStore.getState();
	return t.develop.captureFrame(e ?? n.previewParams ?? n.params, { paramBag: C() });
}
var J = {
	encoding: "perceptual",
	primaries: "rec709"
}, ve = {
	encoding: "linear",
	primaries: "rec709"
};
async function Y(e) {
	let t = I();
	if (!t.develop.captureFloatFrame) return null;
	let n = t.stores.useDevelopStore.getState();
	try {
		return await t.develop.captureFloatFrame(n.previewParams ?? n.params, {
			point: "pre-output",
			space: e ? ve : J,
			paramBag: C()
		});
	} catch (e) {
		return console.warn("[tone-levels] float capture failed:", e), null;
	}
}
function ye(e) {
	let t = I(), n = t.stores.useDevelopStore.getState();
	return n.photoId ? t.develop.renderPhotoFrame(n.photoId, e ?? n.previewParams ?? n.params, {
		...n.paramBag,
		...C()
	}) : Promise.resolve(null);
}
var X = null;
function be(e, t) {
	return X ??= new OffscreenCanvas(e, t), X.width !== e && (X.width = e), X.height !== t && (X.height = t), X.getContext("2d", { willReadFrequently: !0 });
}
function xe(e, t = 640) {
	let { width: n, height: r } = e;
	if (n < 2 || r < 2) return null;
	let i = Math.min(1, t / Math.max(n, r)), a = Math.max(1, Math.round(n * i)), o = Math.max(1, Math.round(r * i)), s = be(a, o);
	return s ? (s.clearRect(0, 0, a, o), s.drawImage(e, 0, 0, a, o), {
		data: s.getImageData(0, 0, a, o).data,
		width: a,
		height: o
	}) : null;
}
async function Se() {
	let e = K(I().stores.useDevelopStore.getState());
	if (!e) return null;
	let t = await ye();
	if (!t) return null;
	try {
		let n = xe(t);
		return n ? {
			photoId: e.photoId,
			readback: n,
			signature: e
		} : null;
	} finally {
		t.close();
	}
}
function Ce(e) {
	let t = e.throttleMs ?? 150, n = !1, r = !1, i = !1, a = null, o = -Infinity, s = null, c = e.develop.getState(), l = !1, u = (t) => {
		s = t?.signature ?? null, e.publish(t);
	}, d = (e) => {
		let t = K(e), n = K(c);
		return e.paramBag !== c.paramBag && !!t && !!n && q(t, n);
	}, f = () => {
		a = null;
		let t = e.develop.getState(), d = K(t);
		if (n || !d || !l && s && q(s, d)) return;
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
function we() {
	return Ce({
		develop: I().stores.useDevelopStore,
		capture: (e) => ye(e),
		readback: (e) => xe(e),
		publish: (e) => W().getState().setFrame(e)
	});
}
var Te = [
	.2224884,
	.71690369,
	.06060791
], Ee = [
	"red",
	"green",
	"blue"
];
function De(e, t) {
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
function Oe(e, t) {
	let r = o(e, "value", n);
	for (let e of Ee) r = o(r, e, De(r.channels[e], t[e]));
	return r;
}
function ke(e, t) {
	switch (e) {
		case "value": return Math.max(Math.max(t[0], t[1]), t[2]);
		case "red": return t[0];
		case "green": return t[1];
		case "blue": return t[2];
	}
}
function Ae(e, n, i, a) {
	if (i === "black") return {
		...e,
		lowInput: ke(n, a)
	};
	if (i === "white") return {
		...e,
		highInput: ke(n, a)
	};
	let o = a[0] * Te[0] + a[1] * Te[1] + a[2] * Te[2], s = e.highInput - e.lowInput;
	if (s <= 0) return e;
	let c = ke(n, a) - e.lowInput;
	if (c < 0) return e;
	let l = c / s, u = o / s;
	return u <= 1e-4 || u >= .9999 ? e : {
		...e,
		gamma: r(Math.log(l) / Math.log(u), t, 10)
	};
}
function je(e, t, n, r, i) {
	if (n === "channel") return o(e, r, Ae(e.channels[r], r, t, i));
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
	for (let e of Ee) s = o(s, e, Ae(s.channels[e], e, t, i));
	return s;
}
function Me(e, t) {
	return o(e, t, n);
}
//#endregion
//#region src/Panel.ts
var Ne = {
	value: "Value",
	red: "Red",
	green: "Green",
	blue: "Blue"
}, Pe = {
	black: "#000000",
	grey: "#808080",
	white: "#ffffff"
}, Fe = {
	black: "Black",
	grey: "Grey",
	white: "White"
}, Ie = {
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
}, Le = (t) => e.find((e) => e === t) ?? "value", Z = (e) => Math.round(e * 255 * 10) / 10;
function Re() {
	let { useEffect: n, useMemo: i, useRef: a, useState: s } = I().react, { Button: c, NumberInput: l, Row: u, Section: d, SegmentedControl: f, Select: p, Stack: m, Toggle: h, tokens: ee } = I().ui, g = I().stores.useDevelopStore, _ = I().develop.useParamScope(), v = _.maskId !== null, te = g((e) => e.photoId), y = g((e) => ne(e.params)), b = re(y), x = W()((e) => e.frame), C = W()((e) => e.channel), w = W()((e) => e.scale), T = W()((e) => e.picking), E = I().develop.usePickDragHeld(), D = a(null), [O, k] = s(null), [A, j] = s(null);
	n(() => v ? void 0 : we(), [v]), n(() => v ? void 0 : () => W().getState().setPicking(null), [v]), n(() => {
		!v && !E && W().getState().setPicking(null);
	}, [v, E]);
	let M = S(_.getParams(), y), N = M.channels[C], P = A ?? ue(N), F = x && x.photoId === te ? x.readback : null, R = i(() => F ? de(F.data, F.width, F.height, M.linear) : null, [F, M.linear]), z = () => S(_.getParams(), y), B = (e) => _.setParams(ie(e)), V = (e) => _.commit(`Tone Levels ${e}`), H = (e) => {
		let t = z();
		B(o(t, C, e(t.channels[C])));
	}, U = (e) => {
		let t = D.current;
		t?.label === e && (D.current = null, k(null), H((e) => t.set(e, t.value)), V(e.toLowerCase()));
	}, G = (e, t, n, r) => L(l, {
		"aria-label": e,
		title: e,
		value: O?.label === e ? O.value : t,
		step: n,
		width: "52px",
		onChange: (t) => {
			D.current = {
				label: e,
				value: t,
				set: r
			}, k({
				label: e,
				value: t
			});
		},
		onBlur: () => U(e),
		onKeyDown: (t) => {
			t.key === "Enter" && U(e);
		}
	}), _e = (e) => L("span", { style: {
		display: "inline-block",
		width: 9,
		height: 9,
		marginRight: 4,
		verticalAlign: "-1px",
		background: Pe[e],
		border: `1px solid ${ee.border}`
	} }), J = (e, t, n) => {
		let r = T?.point === e && T.scope === t;
		return L(c, {
			size: "sm",
			active: r,
			"aria-pressed": r,
			title: `${Ie[t][e]} (Esc cancels)`,
			"aria-label": Ie[t][e],
			onClick: () => W().getState().setPicking(r ? null : {
				point: e,
				scope: t
			})
		}, _e(e), n ?? null);
	}, ve = async () => {
		let e = K(g.getState());
		if (!e) return;
		let t = W().getState().frame, n = t && q(t.signature, e) ? t.readback : null;
		if (!n) {
			let e = await Se(), t = K(g.getState());
			if (!e || !t || !q(e.signature, t)) return;
			n = e.readback;
		}
		let r = z();
		B(Oe(r, de(n.data, n.width, n.height, r.linear))), V("auto input levels");
	}, Y = (...e) => L("div", { style: {
		padding: "0 5px",
		display: "flex",
		flexDirection: "column",
		gap: 2
	} }, ...e);
	return L(m, {
		gap: 10,
		style: { padding: "6px 8px 8px" }
	}, L(u, { gap: 6 }, L("div", { style: {
		flex: "1 1 auto",
		minWidth: 0
	} }, L(p, {
		value: C,
		ariaLabel: "Channel",
		options: e.map((e) => ({
			value: e,
			label: Ne[e]
		})),
		onChange: (e) => W().getState().setChannel(Le(e))
	})), L(c, {
		size: "sm",
		title: "Reset this channel's levels",
		onClick: () => {
			B(Me(z(), C)), V("reset channel");
		}
	}, "Reset Channel")), L(u, { gap: 6 }, L("div", { style: { flex: "1 1 auto" } }, L(f, {
		size: "sm",
		value: M.linear ? "linear" : "perceptual",
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
			t !== z().linear && (B({
				...z(),
				linear: t
			}), V(t ? "linear" : "perceptual"));
		}
	})), L(f, {
		size: "sm",
		value: w,
		options: [{
			value: "linear",
			label: "Lin",
			title: "Linear histogram"
		}, {
			value: "log",
			label: "Log",
			title: "Logarithmic histogram"
		}],
		onChange: (e) => W().getState().setScale(e === "log" ? "log" : "linear")
	})), L(d, { title: "Input Levels" }, Y(v ? null : L(me, {
		bins: R ? R[C] : null,
		scale: w,
		channel: C,
		axis: P
	}), L(he, {
		background: fe(M, C, P),
		label: "Input levels"
	}), L(ge, {
		label: "Input levels handles",
		positions: ce(N),
		axis: P,
		onDrag: (e, t) => {
			j((e) => e ?? P), H((n) => oe(n, ae[e], t, b));
		},
		onRelease: () => {
			j(null), V("input levels");
		}
	})), L(u, {
		gap: 4,
		justify: "space-between"
	}, L(u, { gap: 2 }, v ? null : J("black", "channel"), G("Low input", Z(N.lowInput), 1, (e, t) => ({
		...e,
		lowInput: r(t / 255, b.min, e.highInput)
	}))), G("Gamma", Math.round(N.gamma * 100) / 100, .01, (e, n) => ({
		...e,
		gamma: r(n, t, 10)
	})), L(u, { gap: 2 }, G("High input", Z(N.highInput), 1, (e, t) => ({
		...e,
		highInput: r(t / 255, e.lowInput, b.max)
	})), v ? null : J("white", "channel"))), L(h, {
		checked: M.clampInput,
		label: "Clamp input",
		onChange: (e) => {
			B({
				...z(),
				clampInput: e
			}), V("clamp input");
		}
	})), L(d, { title: "Output Levels" }, Y(L(he, {
		background: pe(C),
		label: "Output levels"
	}), L(ge, {
		label: "Output levels handles",
		positions: le(N),
		onDrag: (e, t) => H((n) => se(n, e === 0 ? "low" : "high", t)),
		onRelease: () => V("output levels")
	})), L(u, {
		gap: 4,
		justify: "space-between"
	}, G("Low output", Z(N.lowOutput), 1, (e, t) => ({
		...e,
		lowOutput: r(t / 255, 0, 1)
	})), G("High output", Z(N.highOutput), 1, (e, t) => ({
		...e,
		highOutput: r(t / 255, 0, 1)
	}))), L(h, {
		checked: M.clampOutput,
		label: "Clamp output",
		onChange: (e) => {
			B({
				...z(),
				clampOutput: e
			}), V("clamp output");
		}
	})), v ? null : L(d, { title: "All Channels" }, L(c, {
		size: "sm",
		full: !0,
		title: "Adjust levels for all channels automatically",
		onClick: () => void ve()
	}, "Auto Input Levels"), L(u, { gap: 4 }, J("black", "all", Fe.black), J("grey", "all", Fe.grey), J("white", "all", Fe.white))));
}
//#endregion
//#region src/picker.ts
function ze(e, t, n) {
	if (t < 2 || n < 2) return null;
	let r = e.x / t, i = e.y / n;
	return r < 0 || r > 1 || i < 0 || i > 1 ? null : {
		x: r,
		y: i
	};
}
function Be(e, t, n, r, i, a) {
	let o = [
		0,
		0,
		0
	], s = 0;
	for (let c = Math.max(0, i - 2); c <= Math.min(n - 1, i + 2); c++) for (let n = Math.max(0, r - 2); n <= Math.min(t - 1, r + 2); n++) {
		let r = (c * t + n) * 4;
		for (let t = 0; t < 3; t++) o[t] += a(e[r + t]);
		s++;
	}
	return s === 0 ? null : [
		o[0] / s,
		o[1] / s,
		o[2] / s
	];
}
function Ve(e, t, n, r, i, o) {
	return Be(e, t, n, r, i, o ? (e) => a(e / 255) : (e) => e / 255);
}
var He = (e, t, n) => ({
	px: Math.min(t - 1, Math.floor(e.x * t)),
	py: Math.min(n - 1, Math.floor(e.y * n))
});
function Ue(e, t) {
	let { px: n, py: r } = He(t, e.width, e.height);
	return Be(e.data, e.width, e.height, n, r, (e) => e);
}
var We = {
	black: "black point",
	grey: "grey point",
	white: "white point"
};
function Ge(e, t) {
	let n = I().stores.useDevelopStore.getState(), r = W().getState(), i = S(n.paramBag, ne(n.params));
	n.setDynParams(ie(je(i, e.point, e.scope, r.channel, t))), n.commitEdit(`Tone Levels pick ${We[e.point]}`), r.setPicking(null);
}
function Ke(e, t) {
	let { width: n, height: r } = e, { px: i, py: a } = He(t, n, r), o = Math.max(0, i - 2), s = Math.max(0, a - 2), c = Math.min(n - 1, i + 2) - o + 1, l = Math.min(r - 1, a + 2) - s + 1, u = new OffscreenCanvas(c, l).getContext("2d", { willReadFrequently: !0 });
	return u ? (u.drawImage(e, o, s, c, l, 0, 0, c, l), {
		data: u.getImageData(0, 0, c, l).data,
		width: c,
		height: l,
		cx: i - o,
		cy: a - s
	}) : null;
}
function qe(e, t) {
	return W().getState().picking === e && I().stores.useDevelopStore.getState().photoId === t;
}
async function Je(e, t) {
	let [n, r] = await Promise.all([_e(), Y(t)]);
	try {
		let i = ze(e, n.width, n.height);
		if (!i) return null;
		if (r) return Ue(r, i);
		let a = Ke(n, i);
		return a && Ve(a.data, a.width, a.height, a.cx, a.cy, t);
	} finally {
		n.close();
	}
}
async function Ye(e, t) {
	try {
		let n = I().stores.useDevelopStore.getState(), r = await Je(e, S(n.paramBag).linear);
		r && qe(t, n.photoId) && Ge(t, r);
	} catch (e) {
		console.warn("[tone-levels] pick failed:", e);
	}
}
function Xe(e) {
	return { onPress: (t) => void Ye(t, e) };
}
function Ze() {
	return W().subscribe((e, t) => {
		e.picking !== t.picking && I().develop.setPickDrag(e.picking ? Xe(e.picking) : null);
	});
}
//#endregion
//#region src/stage.ts
function Qe(e) {
	let t = e.toPrecision(10);
	if (!t.includes("e")) return t.includes(".") ? t : `${t}.0`;
	let [n, r] = t.split("e");
	return `${n.includes(".") ? n : `${n}.0`}e${r}`;
}
var $e = "\nfloat tlMap(float v, float lo, float hi, float ci, float ig, float olo, float ohi, float co) {\n  v = hi != lo ? (v - lo) / (hi - lo) : v - lo;\n  if (ci > 0.5) v = clamp(v, 0.0, 1.0);\n  if (ig != 1.0 && v > 0.0) v = pow(v, ig);\n  v = ohi >= olo ? v * (ohi - olo) + olo : olo - v * (olo - ohi);\n  if (co > 0.5) v = clamp(v, 0.0, 1.0);\n  return v;\n}\nvec3 tlDecode(vec3 y) {\n  vec3 a = abs(y);\n  return sign(y) * mix(a / 12.92, pow((a + 0.055) / 1.055, vec3(2.4)), step(0.04045, a));\n}\nvec3 tlEncode(vec3 x) {\n  vec3 a = abs(x);\n  return sign(x) * mix(a * 12.92, 1.055 * pow(a, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, a));\n}\n", et = (e, t) => {
	let n = _.find((t) => t.key === e);
	if (!n) throw Error(`[tone-levels] no spec for ${e}`);
	let { min: r, max: i } = b(n, t);
	return `clamp(${e}, ${Qe(r)}, ${Qe(i)})`;
}, Q = (e, t, n) => {
	let r = (t) => et(`${e}${t}`, n);
	return `tlMap(${t}, ${r("LowInput")}, ${r("HighInput")}, clampInput, 1.0 / ${r("Gamma")}, ${r("LowOutput")}, ${r("HighOutput")}, clampOutput)`;
}, tt = (e) => `    v = vec3(${Q("red", "v.r", e)}, ${Q("green", "v.g", e)}, ${Q("blue", "v.b", e)});
    v = vec3(${Q("value", "v.r", e)}, ${Q("value", "v.g", e)}, ${Q("value", "v.b", e)});`, nt = `
{
  if (${_.map((e) => `${e.key} != ${Qe(e.default)}`).join(" || ")}) {
    vec3 v = linear > 0.5 ? tlDecode(c) : c;
#if SL_PROCESS_VERSION >= 2
${tt(2)}
#else
${tt(1)}
#endif
    c = linear > 0.5 ? tlEncode(v) : v;
  }
}
`;
function rt() {
	return _.map((e) => ({
		key: e.key,
		glslType: "float",
		default: e.default,
		range: {
			...e.full,
			step: e.step
		},
		label: e.label
	}));
}
function it() {
	return {
		id: c,
		name: "Tone Levels",
		phase: "display-adjust",
		glsl: nt,
		helpers: $e,
		uniforms: rt(),
		presetScope: "global",
		space: { encoding: "perceptual" },
		mask: { maskable: !0 }
	};
}
//#endregion
//#region src/index.ts
var at = `${s}.panel`, ot = null, $ = null;
function st() {
	let e = I().stores.useDevelopStore.getState();
	e.setDynParams(C()), e.commitEdit("Tone Levels reset");
}
function ct(e) {
	F(e), U(), ot = e, e.registerProcessingStage(it()), e.registerPanel({
		id: at,
		title: "Tone Levels",
		component: Re,
		defaultDock: {
			module: "develop",
			direction: "right",
			order: 6.5,
			width: 268
		},
		onReset: st,
		mask: {
			component: Re,
			owns: v.map(y)
		}
	}), $ = Ze();
}
function lt() {
	let e = ot;
	if (e) {
		ot = null;
		try {
			W().getState().setPicking(null), $?.(), $ = null, e.unregisterProcessingStage(c);
		} catch (e) {
			console.warn("[tone-levels] deactivate failed:", e);
		}
	}
}
//#endregion
export { ct as activate, lt as deactivate };

//# sourceMappingURL=index.js.map