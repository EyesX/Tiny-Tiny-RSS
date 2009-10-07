var _feed_cur_page = 0;
var _infscroll_disable = 0;
var _infscroll_request_sent = 0;
var feed_under_pointer = undefined;

var mouse_is_down = false;
var mouse_y = 0;
var mouse_x = 0;

var resize_enabled = false;
var selection_disabled = false;
var counters_last_request = 0;

function toggle_sortable_feedlist(enabled) {
	try {

		if (enabled) {
			Sortable.create('feedList', {onChange: feedlist_dragsorted, only: "feedCat"});
		} else {
			Sortable.destroy('feedList');
		}

	} catch (e) {
		exception_error("toggle_sortable_feedlist", e);
	}
}

function viewCategory(cat) {
	viewfeed(cat, '', true);
	return false;
}

function printFeedEntry(id, title, row_class, unread, icon) {

	var tmp = "";
	var fctr_class = "";
	var feed_icon = "";

	if (unread > 0) {
		row_class += "Unread";
		fctr_class = "feedCtrHasUnread";
	} else {
		fctr_class = "feedCtrNoUnread";
	}

	if (icon) {
		feed_icon = "<img id='FIMG-"+id+"' src='" + icon + "'>";
	} else {
		feed_icon = "<img id='FIMG-"+id+"' src='images/blank_icon.gif'>";
	}

	var link = "<a title=\"FIXME\" id=\"FEEDL-"+id+"\""+
		"href=\"javascript:viewfeed('"+id+"', '', false, '', false, 0);\">"+
		title + "</a>";

	tmp += "<li id='FEEDR-"+id+"' class="+row_class+">" + feed_icon + 
		"<span id=\"FEEDN-"+id+"\">" + link + "</span>";

	tmp += " <span class='"+fctr_class+"' id=\"FEEDCTR-"+id+"\">" +
           "(<span id=\"FEEDU-"+id+"\">"+unread+"</span>)</span>";
			
	tmp += "</li>";

	return tmp;
}

function render_feedlist(data) {
	try {

		var f = $("feeds-frame");
		f.innerHTML = data;
//		cache_invalidate("FEEDLIST");
//		cache_inject("FEEDLIST", data, getInitParam("num_feeds"));
		feedlist_init();

	} catch (e) {
		exception_error("render_feedlist", e);
	}
}

function feedlist_callback2(transport) {
	try {
		debug("feedlist_callback2");
		if (!transport_error_check(transport)) return;
		render_feedlist(transport.responseText);
	} catch (e) {
		exception_error("feedlist_callback2", e);
	}
}

function viewNextFeedPage() {
	try {
		//if (!getActiveFeedId()) return;

		debug("viewNextFeedPage: calling viewfeed(), p: " + parseInt(_feed_cur_page+1));

		viewfeed(getActiveFeedId(), undefined, activeFeedIsCat(), undefined,
			undefined, parseInt(_feed_cur_page+1));

	} catch (e) {
		exception_error("viewNextFeedPage", e);
	}
}


function viewfeed(feed, subop, is_cat, subop_param, skip_history, offset) {
	try {

		if (offline_mode) return viewfeed_offline(feed, subop, is_cat, subop_param,
			skip_history, offset);

//		if (!offset) page_offset = 0;

		last_requested_article = 0;
		//counters_last_request = 0;

		if (feed == getActiveFeedId()) {
			cache_invalidate("F:" + feed);
		}

/*		if (getInitParam("theme") == "" || getInitParam("theme") == "compact") {
			if (getInitParam("hide_feedlist") == 1) {
				Element.hide("feeds-holder");
			}		
		} */

		var force_nocache = false;

		var page_offset = 0;

		if (offset > 0) {
			page_offset = offset;
		} else {
			page_offset = 0;
			_feed_cur_page = 0;
			_infscroll_disable = 0;
		}

		if (getActiveFeedId() != feed) {
			_feed_cur_page = 0;
			active_post_id = 0;
			_infscroll_disable = 0;
		}

		if (page_offset != 0 && !subop) {
			var date = new Date();
			var timestamp = Math.round(date.getTime() / 1000);

			debug("<b>" + _infscroll_request_sent + " : " + timestamp + "</b>");

			if (_infscroll_request_sent && _infscroll_request_sent + 30 > timestamp) {
				debug("infscroll request in progress, aborting");
				return;
			}

			_infscroll_request_sent = timestamp;			
		}

		enableHotkeys();

		closeInfoBox();

		Form.enable("main_toolbar_form");

		var toolbar_form = document.forms["main_toolbar_form"];
		var toolbar_query = Form.serialize("main_toolbar_form");

		if (toolbar_form.query) {
			if (toolbar_form.query.value != "") {
				force_nocache = true;
			}
			toolbar_form.query.value = "";
		}

		var query = "backend.php?op=viewfeed&feed=" + feed + "&" +
			toolbar_query + "&subop=" + param_escape(subop);

		if ($("search_form")) {
			var search_query = Form.serialize("search_form");
			query = query + "&" + search_query;
			$("search_form").query.value = "";
			closeInfoBox(true);
			force_nocache = true;
		}

//		debug("IS_CAT_STORED: " + activeFeedIsCat() + ", IS_CAT: " + is_cat);

		if (subop == "MarkAllRead") {

			catchup_local_feed(feed, is_cat);

			var show_next_feed = getInitParam("on_catchup_show_next_feed") == "1";

			if (show_next_feed) {

				if (!activeFeedIsCat()) {
	
					var feedlist = $('feedList');
				
					var next_unread_feed = getRelativeFeedId(feedlist,
							feed, "next", true);
	
					if (!next_unread_feed) {
						next_unread_feed = getRelativeFeedId(feedlist,
							-3, "next", true);
					}
		
					if (next_unread_feed) {
						query = query + "&nuf=" + param_escape(next_unread_feed);
						//setActiveFeedId(next_unread_feed);
						feed = next_unread_feed;
					}
				} else {
	
					var next_unread_feed = getNextUnreadCat(feed);

					/* we don't need to specify that our next feed is actually
					a category, because we're in the is_cat mode by definition
					already */

					if (next_unread_feed && show_next_feed) {
						query = query + "&nuf=" + param_escape(next_unread_feed);
						feed = next_unread_feed;
					}

				}
			}
		}

		if (is_cat) {
			query = query + "&cat=1";
		}

		if (page_offset != 0) {
			query = query + "&skip=" + page_offset;

			// to prevent duplicate feed titles when showing grouped vfeeds
			if (vgroup_last_feed) {
				query = query + "&vgrlf=" + param_escape(vgroup_last_feed);
			}
		}

		var date = new Date();
		var timestamp = Math.round(date.getTime() / 1000);
		query = query + "&ts=" + timestamp
		
		disableContainerChildren("headlinesToolbar", false);
		Form.enable("main_toolbar_form");

		// for piggybacked counters

		if (tagsAreDisplayed()) {
			query = query + "&omode=lt";
		} else {
			query = query + "&omode=flc";
		}

		if (!async_counters_work) {
			query = query + "&csync=true";
		}

		debug(query);

		var container = $("headlinesInnerContainer");

/*		if (container && page_offset == 0 && !isCdmMode()) {
			new Effect.Fade(container, {duration: 1, to: 0.01,
				queue: { position:'end', scope: 'FEEDL-' + feed, limit: 1 } } );
		} */

		var unread_ctr = -1;
		
		if (!is_cat) unread_ctr = get_feed_unread(feed);

		var cache_check = false;

		if (unread_ctr != -1 && !page_offset && !force_nocache && !subop) {

			var cache_prefix = "";
				
			if (is_cat) {
				cache_prefix = "C:";
			} else {
				cache_prefix = "F:";
			}

			cache_check = cache_check_param(cache_prefix + feed, unread_ctr);
			debug("headline cache check: " + cache_check);
		}

		if (cache_check) {
			var f = $("headlines-frame");

			clean_feed_selections();

			setActiveFeedId(feed, is_cat);
		
			if (!is_cat) {
				var feedr = $("FEEDR-" + feed);
				if (feedr && !feedr.className.match("Selected")) {	
					feedr.className = feedr.className + "Selected";
				} 
			} else {
				var feedr = $("FCAT-" + feed_id);
				if (feedr && !feedr.className.match("Selected")) {	
					feedr.className = feedr.className + "Selected";
				} 
			}

			f.innerHTML = cache_find_param(cache_prefix + feed, unread_ctr);

			request_counters();
			remove_splash();

		} else {

			if (!page_offset) {
				var feedr;

				if (is_cat) {
					feedr = $('FCAP-' + feed);
				} else {
					feedr = $('FEEDR-' + feed);
				}

				if (feedr) {
					var ll = document.createElement('img');

					ll.src = 'images/indicator_tiny.gif';
					ll.className = 'hlLoading';
					ll.id = 'FLL-' + feed;

					feedr.appendChild(ll);
				}
			}

			new Ajax.Request(query, {
				onComplete: function(transport) { 
					headlines_callback2(transport, page_offset); 
				} });
		}

	} catch (e) {
		exception_error("viewfeed", e);
	}		
}

function toggleCollapseCat_af(effect) {
	//var caption = elem.id.replace("FCATLIST-", "");

	try {

		var elem = effect.element;
		var cat = elem.id.replace("FCATLIST-", "");
		var cap = $("FCAP-" + cat);

		if (Element.visible(elem)) {
			cap.innerHTML = cap.innerHTML.replace("…", "");
		} else {
			if (cap.innerHTML.lastIndexOf("…") != cap.innerHTML.length-3) {
				cap.innerHTML = cap.innerHTML + "…";
			}
		}

	} catch (e) {
		exception_error("toggleCollapseCat_af", e);
	}
}

function toggleCollapseCat(cat) {
	try {
	
		var cat_elem = $("FCAT-" + cat);
		var cat_list = $("FCATLIST-" + cat).parentNode;
		var caption = $("FCAP-" + cat);
		
/*		if (cat_list.className.match("invisible")) {
			cat_list.className = "";
			caption.innerHTML = caption.innerHTML.replace("...", "");
			if (cat == 0) {
				setCookie("ttrss_vf_uclps", "0");
			}
		} else {
			cat_list.className = "invisible";
			caption.innerHTML = caption.innerHTML + "...";
			if (cat == 0) {
				setCookie("ttrss_vf_uclps", "1");
			} 

		} */

		if (cat == 0) {
			if (Element.visible("FCATLIST-" + cat)) {
				setCookie("ttrss_vf_uclps", "1");
			} else {
				setCookie("ttrss_vf_uclps", "0");
			}
		} 

		if (cat == -2) {
			if (Element.visible("FCATLIST-" + cat)) {
				setCookie("ttrss_vf_lclps", "1");
			} else {
				setCookie("ttrss_vf_lclps", "0");
			}
		} 

		if (cat == -1) {
			if (Element.visible("FCATLIST-" + cat)) {
				setCookie("ttrss_vf_vclps", "1");
			} else {
				setCookie("ttrss_vf_vclps", "0");
			}
		} 

		Effect.toggle('FCATLIST-' + cat, 'blind', { duration: 0.5,
			afterFinish: toggleCollapseCat_af });

		new Ajax.Request("backend.php?op=feeds&subop=collapse&cid=" + 
			param_escape(cat));

		local_collapse_cat(cat);

	} catch (e) {
		exception_error("toggleCollapseCat", e);
	}
}

function feedlist_dragsorted(ctr) {
	try {
		var elem = $("feedList");

		var cats = elem.getElementsByTagName("LI");
		var ordered_cats = new Array();

		for (var i = 0; i < cats.length; i++) {
			if (cats[i].id && cats[i].id.match("FCAT-")) {
				ordered_cats.push(cats[i].id.replace("FCAT-", ""));
			}
		}

		if (ordered_cats.length > 0) {

			var query = "backend.php?op=feeds&subop=catsort&corder=" + 
				param_escape(ordered_cats.toString());

			debug(query);

			new Ajax.Request(query);
		}

	} catch (e) {
		exception_error("feedlist_dragsorted", e);
	}
}

function feedlist_init() {
	try {
//		if (arguments.callee.done) return;
//		arguments.callee.done = true;		
		
		loading_set_progress(90);

		debug("in feedlist init");
		
		hideOrShowFeeds(getInitParam("hide_read_feeds") == 1);
		document.onkeydown = hotkey_handler;
		document.onmousemove = mouse_move_handler;
		document.onmousedown = mouse_down_handler;
		document.onmouseup = mouse_up_handler;

		if (!offline_mode) setTimeout("timeout()", 1);

		setTimeout("hotkey_prefix_timeout()", 5*1000);

		if (typeof correctPNG != 'undefined') {
			correctPNG();
		}

		if (getActiveFeedId()) {
			//debug("some feed is open on feedlist refresh, reloading");
			//setTimeout("viewCurrentFeed()", 100);
		} else {
			if (getInitParam("cdm_auto_catchup") != 1 && get_feed_unread(-3) > 0) {
				notify_silent_next();
				setTimeout("viewfeed(-3)", 100);
			} else {
				remove_splash();
			}
		}

		if (getInitParam("theme") == "") {
			setTimeout("hide_footer()", 5000);
		}

		init_collapsable_feedlist(getInitParam("theme"));

		toggle_sortable_feedlist(isFeedlistSortable());

	} catch (e) {
		exception_error("feedlist/init", e);
	}
}

function hide_footer_af(effect) {
	try {
		var c = $("content-frame");

		if (c) {
			c.style.bottom = "0px";

			var ioa = $("inline_orig_article");

			if (ioa) {
				ioa.height = c.offsetHeight;
			}

		} else {
			var h = $("headlines-frame");

			if (h) {
				h.style.bottom = "0px";
			}
		}

	} catch (e) {
		exception_error("hide_footer_af", e);
	}
}

function hide_footer() {
	try {
		if (Element.visible("footer")) {
			new Effect.Fade("footer", { afterFinish: hide_footer_af });
		}
	} catch (e) {
		exception_error("hide_footer", e);
	}
}

/*
function init_hidden_feedlist(theme) {
	try {
		debug("init_hidden_feedlist");

		if (theme != "" && theme != "compact") return;

		var fl = $("feeds-holder");
		var fh = $("headlines-frame");
		var fc = $("content-frame");
		var ft = $("toolbar");
		var ff = $("footer");
		var fhdr = $("header");

		var fbtn = $("toggle_feeds_btn");

		if (fbtn) Element.show(fbtn);

		fl.style.top = fh.offsetTop + "px";
		fl.style.backgroundColor = "white"; //FIXME

		Element.hide(fl);
		
		fh.style.left = "0px";
		ft.style.left = "0px";
		if (fc) fc.style.left = "0px";
		if (ff) ff.style.left = "0px";

		if (theme == "compact") {
			fhdr.style.left = "10px";
			fl.style.top = (fh.offsetTop + 1) + "px";
		}

	} catch (e) {
		exception_error("init_hidden_feedlist", e);
	}
} */

function init_collapsable_feedlist(theme) {
	try {
		debug("init_collapsable_feedlist");

		if (theme != "" && theme != "compact" && theme != "graycube" &&
				theme != "compat") return;

		var fbtn = $("collapse_feeds_btn");

		if (fbtn) Element.show(fbtn);

		if (getCookie("ttrss_vf_fclps") == 1) {
			collapse_feedlist();
		}

	} catch (e) {
		exception_error("init_hidden_feedlist", e);
	}

}

function mouse_move_handler(e) {
	try {
		var client_y;
		var client_x;

		if (window.event) {
			client_y = window.event.clientY;
			client_x = window.event.clientX;
		} else if (e) {
			client_x = e.screenX;
			client_y = e.screenY;
		}

		if (mouse_is_down) {

			if (mouse_y == 0) mouse_y = client_y;
			if (mouse_x == 0) mouse_x = client_x;

			resize_headlines(mouse_x - client_x, mouse_y - client_y);

			mouse_y = client_y;
			mouse_x = client_x;

			return false;
		}

	} catch (e) {
		exception_error("mouse_move_handler", e);
	}
}

function enable_selection(b) {
	selection_disabled = !b;
}

function enable_resize(b) {
	resize_enabled = b;
}

function mouse_down_handler(e) {
	try {

		/* do not prevent right click */
		if (e && e.button && e.button == 2) return;

		if (resize_enabled) { 
			mouse_is_down = true;
			mouse_x = 0;
			mouse_y = 0;
			document.onselectstart = function() { return false; };
			return false;
		}

		if (selection_disabled) {
			document.onselectstart = function() { return false; };
			return false;
		}

	} catch (e) {
		exception_error("mouse_down_handler", e);
	}
}

function mouse_up_handler(e) {
	try {
		mouse_is_down = false;

		if (!selection_disabled) {
			document.onselectstart = null;
			var e = $("headlineActionsBody");
			if (e) Element.hide(e);
			
			var e = $("offlineModeDrop");
			if (e) Element.hide(e);

		}

	} catch (e) {
		exception_error("mouse_up_handler", e);
	}
}

function request_counters_real() {

	try {

		if (offline_mode) return;

		debug("requesting counters...");

		var query = "backend.php?op=rpc&subop=getAllCounters";

		if (tagsAreDisplayed()) {
			query = query + "&omode=tl";
		} else {
			query = query + "&omode=flc";
		}

		new Ajax.Request(query, {
			onComplete: function(transport) { 
				try {
					all_counters_callback2(transport, true);
				} catch (e) {
					exception_error("viewfeed/getcounters", e);
				}
			} });

	} catch (e) {
		exception_error("request_counters_real", e);
	}
}


function request_counters() {

	try {

		if (getInitParam("bw_limit") == "1") return;

		var date = new Date();
		var timestamp = Math.round(date.getTime() / 1000);

//		if (getInitParam("sync_counters") == "1" || 
//				timestamp - counters_last_request > 10) {

		if (timestamp - counters_last_request > 15) {
			debug("scheduling request of counters...");
			window.setTimeout("request_counters_real()", 1000);
			counters_last_request = timestamp;
		} else {
			debug("request_counters: rate limit reached: " + (timestamp - counters_last_request));
		}

	} catch (e) {
		exception_error("request_counters", e);
	}
}


