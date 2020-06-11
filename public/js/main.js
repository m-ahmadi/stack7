import comp1 from './comp1.js';
import comp2 from './comp2/comp2.js';

import page1 from './page1/main.js';
import page2 from './page2/main.js';

const pages = {page1, page2};

window.addEventListener('_route', function (e) {
	const route = e.detail;
	pages[route]();
});

document.addEventListener('DOMContentLoaded', async function () {
	if (window._route) pages[window._route]();
	
	await comp1.init();
	comp2.init();
	
});