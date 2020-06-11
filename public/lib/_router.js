(function () {
	const views = ['', 'page1', 'page2', 'not-found'];
	
	window.addEventListener('popstate', async function () {
		const { hash } = location;
		if (!hash) {
			location.replace('/sigman4/public/#/');
			return;
		}
		
		const route = hash.slice(2);
		const firstSegment = route.split('/')[0];
		
		if ( (hash && !/^#\//.test(hash)) || !views.includes(firstSegment) ) {
			location.replace('#/not-found');
			return;
		}
		
		if (route) {
			window._route = route;
			window.dispatchEvent(new CustomEvent('_route', {detail: route}));
			
			document.title = firstSegment[0].toUpperCase() + firstSegment.slice(1).toLowerCase();
			const page = `${firstSegment}/index`;
			const html = _templates[page]();
			setContent(html);
			
			// simple:
			/* const file = await (await fetch(routeHtm)).text();
			setContent(file); */
			
			// with cache:
			/* let file = sessionStorage.getItem(filePath);
			if (!file) {
				file = await (await fetch(filePath)).text();
				sessionStorage.setItem(filePath, file);
			}
			setContent(file); */
		}
	});

	window.dispatchEvent(new Event('popstate'));

	function setContent(html,js,css) {
		document.readyState !== 'loading'
			? document.getElementById('content').innerHTML = html
			: setTimeout(setContent, 50, html);
	}
})();