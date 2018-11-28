
define(["trademapper.portlookup"], function(portlookup) {
	"use strict";
	// this is done to avoid circular dependencies
	var countryGetPointFunc, portGetPointFunc, latLongToPointFunc,
	locationRoles = ["origin", "exporter", "transit", "importer"],

	setLatLongToPointFunc = function(func) {
		latLongToPointFunc = func;
	},

	setCountryGetPointFunc = function(func) {
		countryGetPointFunc = func;
	},

	setPortGetPointFunc = function(func) {
		portGetPointFunc = func;
	};

	function RolesCollection(role) {
		this.roles = {};
		for (var i = 0; i < locationRoles.length; i++) {
			this.roles[locationRoles[i]] = false;
		}
		if (role) {
			this.addRole(role);
		}
	}

	RolesCollection.prototype.addRole = function(role) {
		if (this.roles.hasOwnProperty(role)) {
			this.roles[role] = true;
		} else {
			console.log("Unknown role for point: " + role);
		}
	};

	RolesCollection.prototype.addRoles = function(roleArray) {
		for (var i = 0; i < roleArray.length; i++) {
			this.addRole(roleArray[i]);
		}
	};

	RolesCollection.prototype.toArray = function() {
		var outArray = [];
		for (var i = 0; i < locationRoles.length; i++) {
			if (this.roles[locationRoles[i]]) {
				outArray.push(locationRoles[i]);
			}
		}
		return outArray;
	};

	RolesCollection.prototype.toString = function() {
		return this.toArray().join(",");
	};

	// Point* classes have a locationGroupId which is used to
	// determine the actual route: if a Route has multiple points with the
	// same locationGroupId, only the most specific of the points is used
	// (latlong is more specific than port; port is more specific than country);
	// locationGroupId is specified using locationOrder in the form, which doubles
	// up as a grouping mechanism for columns
	//
	// getPointIdentifier() should return the country code relating to the point (if
	// available) or the port code if the country code is unavailable
	function PointLatLong(role, latitude, longitude, locationGroupId) {
		this.roles = new RolesCollection(role);
		this.locationGroupId = locationGroupId;
		this.type = "latlong";
		this.latlong = [longitude, latitude];
		this.point = latLongToPointFunc(this.latlong);
	}

	PointLatLong.prototype.toString = function() {
		return this.latlong[0] + '-' + this.latlong[1];
	};

	PointLatLong.prototype.getPointIdentifier = function() {
		return null;
	};

	function PointNameLatLong(name, role, latitude, longitude, locationGroupId) {
		this.roles = new RolesCollection(role);
		this.locationGroupId = locationGroupId;
		this.type = "namelatlong";
		this.name = name;
		this.latlong = [longitude, latitude];
		this.point = latLongToPointFunc(this.latlong);
	}

	PointNameLatLong.prototype.toString = function() {
		return this.name;
	};

	PointNameLatLong.prototype.getPointIdentifier = function() {
		return null;
	};

	function PointCountry(countryCode, role, locationGroupId) {
		this.roles = new RolesCollection(role);
		this.locationGroupId = locationGroupId;
		this.type = "country";
		this.countryCode = countryCode;
		this.point = countryGetPointFunc(countryCode);
	}

	PointCountry.prototype.toString = function() {
		return this.countryCode;
	};

	PointCountry.prototype.getCode = function() {
		return this.countryCode;
	};

	PointCountry.prototype.getPointIdentifier = function() {
		return this.countryCode;
	};

	function PointPort(portCode, role, locationGroupId) {
		this.roles = new RolesCollection(role);
		this.locationGroupId = locationGroupId;
		this.type = "port";
		this.portCode = portCode;
		this.point = portGetPointFunc(portCode);
	}

	PointPort.prototype.toString = function() {
		return this.portCode;
	};

	PointPort.prototype.getCode = function() {
		return this.portCode;
	};

	PointPort.prototype.getPointIdentifier = function() {
		var port = portlookup.getPortDetails(this.portCode);
		if (port !== null && port.hasOwnProperty('countryCode')) {
			return port['countryCode'];
		}
		return this.portCode;
	};

	/*
	 * points is a list of objects of PointXyz
	 * quantity is the volume of trade
	 */
	function Route(points, quantity) {
		this.quantity = quantity || 1;

		if (points.length === 0) {
			this.points = [];
		} else {
			this.points = [points[0]];
			for (var i = 1; i < points.length; i++) {
				// if last of this.points has same roles string as next of points,
				// combine the two points into one and add both of their roles together
				var lastThisPoint = this.points.slice(-1)[0];
				if (lastThisPoint.toString() === points[i].toString()) {
					lastThisPoint.roles.addRoles(points[i].roles.toArray());
				} else {
					this.points.push(points[i]);
				}
			}
		}

		this.collapsePoints();
	}

	// If there are multiple points with the same locationGroupId in the
	// points array, use the point with the highest precedence
	// for that role (latlong > port > country code).
	//
	// e.g. if points contains:
	//   [origin:countryCode, origin:PointPort, origin:PointNameLatLong]
	// and all three have values, use the value for origin:PointNameLatLong
	// (the most specific).
	//
	// The less-specific points (from the Route's perspective) are discarded
	// from the route.
	//
	// If there are no location groups with multiple points in them, don't do
	// anything. This insures that existing behaviour still works.
	Route.prototype.collapsePoints = function() {
		// gather the points into location groups
		var locationGroups = {};

		for (var i = 0; i < this.points.length; i++) {
			var point = this.points[i];
			var locationGroupId = point.locationGroupId;
			if (!(locationGroups.hasOwnProperty(locationGroupId))) {
				locationGroups[locationGroupId] = [];
			}

			locationGroups[locationGroupId].push(point);
		}

		// for each location group, choose the most-specific location
		for (var key in locationGroups) {
			var points = locationGroups[key];

			// order the points, most-specific first
			points.sort(function (a, b) {
				var aType = typeof(a);
				if (aType === PointNameLatLong) {
					return -1;
				}

				var bType = typeof(b);
				if (bType === PointNameLatLong) {
					return 1;
				}

				if (aType === PointPort && bType === PointCountry) {
					return -1;
				}

				return 1;
			});

			locationGroups[key] = points[0];
		}

		// sort the remaining points by location group ID (which is also the
		// location order)
		var keys = Object.keys(locationGroups);
		keys.sort();

		var reducedPoints = [];
		for (var j = 0; j < keys.length; j++) {
			reducedPoints.push(locationGroups[keys[j]]);
		}
		this.points = reducedPoints;
	};

	Route.prototype.toString = function(joinStr) {
		return this.points.map(function(p){return p.toString();}).join(joinStr);
	};

	Route.prototype.toHtmlId = function() {
		return this.toString('').toLowerCase().replace(/[^\w]/g, '');
	};

	function RouteCollection() {
		this.routes = {};
	}

	RouteCollection.prototype.routeCount = function() {
		var routes = Object.keys(this.routes);
		return routes.length;
	};

	RouteCollection.prototype.getRoutes = function() {
		var routeList = [], routeKeys = Object.keys(this.routes);
		for (var i = 0; i < routeKeys.length; i++) {
			routeList.push(this.routes[routeKeys[i]]);
		}
		return routeList;
	};

	RouteCollection.prototype.getCenterTerminalList = function() {
		var i, j, route, source, dest, sourceKeys, destKeys, terminalList,
			centerObj, terminalObj, maxSourceQuantity,
			centerTerminalObj = {},
			centerTerminalList = [],
			routeKeys = Object.keys(this.routes);

		// first extract into nested objects and de-duplicate routes
		for (i = 0; i < routeKeys.length; i++) {
			route = this.routes[routeKeys[i]];
			for (j = 0; j < route.points.length - 1; j++) {
				source = route.points[j];
				dest = route.points[j + 1];
				// TODO: record type - source or transit - maybe we get two different sets ...
				// or could be [source2dest, source2transit, transit2dest, transit2transit]
				// to allow for different gradients - but then they will be on top of each other :/
				if (!centerTerminalObj.hasOwnProperty(source.toString())) {
					centerTerminalObj[source.toString()] = {
						source: source,
						point: source.point,
						quantity: route.quantity
					};
				} else {
					centerTerminalObj[source.toString()].quantity += route.quantity;
				}

				if (!centerTerminalObj[source.toString()].hasOwnProperty(dest.toString())) {
					centerTerminalObj[source.toString()][dest.toString()] = {
						dest: dest,
						point: dest.point,
						quantity: route.quantity
					};
				} else {
					centerTerminalObj[source.toString()][dest.toString()].quantity += route.quantity;
				}
			}
		}

		// now convert to list of center and terminals
		maxSourceQuantity = 0;
		sourceKeys = Object.keys(centerTerminalObj);
		for (i = 0; i < sourceKeys.length; i++) {
			terminalList = [];
			centerObj = centerTerminalObj[sourceKeys[i]];
			if (centerObj.point === undefined) {
				console.log("missing point for center: " + sourceKeys[i]);
				continue;
			}
			if (centerObj.quantity > maxSourceQuantity) {
				maxSourceQuantity = centerObj.quantity;
			}
			destKeys = Object.keys(centerObj);
			for (j = 0; j < destKeys.length; j++) {
				if (destKeys[j] === "point" ||
						destKeys[j] === "quantity" ||
						destKeys[j] === "source") {
					continue;
				}
				terminalObj = centerObj[destKeys[j]];
				if (terminalObj.point === undefined) {
					console.log("missing point for terminal: " + destKeys[j]);
					continue;
				}
				terminalList.push({
					point: terminalObj.dest,
					lat: terminalObj.point[0],
					lng: terminalObj.point[1],
					quantity: terminalObj.quantity
				});
			}
			centerTerminalList.push({
				center: {
					lat: centerObj.point[0],
					lng: centerObj.point[1],
					quantity: centerObj.quantity,
					point: centerObj.source
				},
				terminals: terminalList
			});
		}
		return {
			centerTerminalList: centerTerminalList,
			maxSourceQuantity: maxSourceQuantity
		};
	};

	/*
	 * Create an object with a key for each point, and for each point
	 * record whether it is an origin, importer, transit and/or exporter.
	 * If a point is a port, add a key for that port's country instead if
	 * available, or the port code if not. If the port code is used, this
	 * will result in the country containing that port being uncoloured.
	 * TODO if a point is a lat/lon, add the country the point lies within
	 */
	RouteCollection.prototype.getPointRoles = function() {
		var i, j, route, pointIdentifier,
			pointRoles = {},
			routeKeys = Object.keys(this.routes);

		for (i = 0; i < routeKeys.length; i++) {
			route = this.routes[routeKeys[i]];
			for (j = 0; j < route.points.length; j++) {
				// if a port, uses the code of the country containing that port,
				// or the port code if the country code isn't known;
				// if a country, uses the code for the country;
				// if a lat/lon, we don't know the country code (yet)
				pointIdentifier = route.points[j].getPointIdentifier();
				if (pointIdentifier !== null) {
					if (!pointRoles.hasOwnProperty(pointIdentifier)) {
						pointRoles[pointIdentifier] = {
							point: route.points[j].point,
							roles: new RolesCollection()
						};
					}
					pointRoles[pointIdentifier].roles.addRoles(route.points[j].roles.toArray());
				}
			}
		}
		return pointRoles;
	};

	RouteCollection.prototype.addRoute = function(route) {
		var routeName = route.toString();
		if (this.routes.hasOwnProperty(routeName)) {
			var thisRoute = this.routes[routeName];
			thisRoute.quantity += route.quantity;
			for (var i = 0; i < thisRoute.points.length; i++) {
				thisRoute.points[i].roles.addRoles(route.points[i].roles.toArray());
			}
		}
		else {
			this.routes[routeName] = route;
		}
	};

	RouteCollection.prototype.maxQuantity = function(minRouteLength) {
		minRouteLength = minRouteLength !== undefined ? minRouteLength : 2;
		var routeList = this.getRoutes();
		if (routeList.length === 0) {
			return 0;
		} else {
			return Math.max.apply(null, routeList.map(function(aRoute) {
				if (aRoute.points.length >= minRouteLength) {
					return aRoute.quantity;
				} else {
					return 0;
				}
			}));
		}
	};

	return {
		setCountryGetPointFunc: setCountryGetPointFunc,
		setPortGetPointFunc: setPortGetPointFunc,
		setLatLongToPointFunc: setLatLongToPointFunc,
		locationRoles: locationRoles,
		RolesCollection: RolesCollection,
		PointLatLong: PointLatLong,
		PointNameLatLong: PointNameLatLong,
		PointCountry: PointCountry,
		PointPort: PointPort,
		Route: Route,
		RouteCollection: RouteCollection
	};
});

