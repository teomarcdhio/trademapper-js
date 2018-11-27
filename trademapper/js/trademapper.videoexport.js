define(["gif", "jquery", "util", "trademapper.imageloader"], function (GIF, $, util, ImageLoader) {

	return {
		// button: button which when clicked initiates the export
		// trademapper: trademapper instance
		init: function (button, trademapper) {
			this.trademapper = trademapper;
			this.height = this.trademapper.config.height;
			this.width = this.trademapper.config.width;

			// provide a way to trigger events, even though this component has no
			// DOM element of its own
			this.eventFirer = $({});

			button.on("click", function () {
				this.eventFirer.trigger("start");
				this.run();
			}.bind(this));

			// to handle the download
			this.link = document.createElement("a");
			this.link.style.display = "none";

			// name given to file when downloaded
			this.link.download = "animated_map.gif";

			document.body.appendChild(this.link);

			this.imageLoader = ImageLoader();
		},

		// proxy on() calls onto the eventFirer
		on: function (event, handler) {
			this.eventFirer.on(event, handler);
		},

		// images: array of loaded Image objects
		// callback: function invoked with the blob generated by combining the
		// Image objects into a gif
		// this fires progress events, but not the start/end events
		createGif: function (images) {
			return new Promise(function (resolve, reject) {
				var gif = new GIF({
					workers: 6,
					quality: 5,
					height: this.height,
					width: this.width,
					workerScript: "./js/lib/gif.worker.js",
					repeat: -1,
				});

				gif.on("finished", function (blob) {
					this.eventFirer.trigger("progress", 100);
					resolve(blob);
				}.bind(this));

				for (var i = 0; i < images.length; i++) {
					gif.addFrame(images[i], { delay: 2000 });
					this.eventFirer.trigger("progress", parseInt((i / images.length) * 100));
				}

				gif.render();
			}.bind(this));
		},

		/**
		 * triggers the following events (can be bound to via on()):
		 *	 start => video export started
		 *	 progress => percentage of frames exported to the gif; note that there
		 *		 is a further step to render the gif once this is done, so total
		 *		 progress of the whole export is not exactly equal to the value
		 *		 sent with this event
		 *	 end => video export finished
		 */
		run: function () {
			this.trademapper.yearslider.saveState();
			this.trademapper.yearslider.pause();

			var minYear = this.trademapper.minMaxYear[0];
			var maxYear = this.trademapper.minMaxYear[1];

			var yearContainer = $("<svg class='year-container' x='0' y='0'>" +
				"<text class='year-text' x='0.25em' y='1em'></text>" +
				"</svg>");
			var yearText = yearContainer.find(".year-text");

			// step through the years in the data, exporting the SVG to an image
			// data URL at each step
			var urls = [];
			for (var year = minYear; year <= maxYear; year++) {
				this.trademapper.showTradeForYear(year);
				var svgElement = this.trademapper.imageExport.cloneSvg();

				// add the year text box in the top-left corner
				svgElement.append(yearContainer);
				yearText.html(year);

				urls.push(util.svgToObjectURL(svgElement.get(0)));
			}

			this.imageLoader.load(urls)
			.then(function (images) {
				return this.createGif(images);
			}.bind(this))
			.then(function (blob) {
				this.link.href = window.URL.createObjectURL(blob);
				this.link.click();
				this.eventFirer.trigger("end");
				this.trademapper.yearslider.applySavedState();
			}.bind(this));
		}
	}

});