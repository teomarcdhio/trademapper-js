// Progress bar modal for when topojson files are loading, gif exporting etc.;
// this overlays the whole screen to prevent the map being moved or zoomed
// while processing is on-going
define(["jquery", "text!../fragments/progressskeleton.html"], function ($, html) {

	/**
	 * Factory function to add a progress modal to a DOM element.
	 *
	 * element: DOM element to attach the overlay to; best if this is the
	 * <body> (the default if not specified)
	 */
	return function (element) {
		if (element === null) {
			element = document.body;
		}

		var modal = $(html);
		var progress = modal.find("[role='progressbar']");
		$(element).append(modal);

		this.show = function () {
			modal.modal("show");
		};

		this.hide = function () {
			modal.modal("hide");
		};

		// set progress percentage
		this.setProgress = function (percentage) {
			progress.css("width", percentage + "%");
			progress.attr("aria-value-now", percentage);
		};

		return this;
	};

});