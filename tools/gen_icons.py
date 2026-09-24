#!/usr/bin/env python3
"""Build app/src/main/assets/js/icons.js: a curated, tagged subset of Google Material Symbols (Rounded, filled).

Usage: npm pack @material-symbols/svg-400 && tar xzf material-symbols-svg-400-*.tgz
       python3 tools/gen_icons.py package app/src/main/assets/js/icons.js
Add a line below (name: search tags) to offer another emblem; the name must exist in the package."""
import os, re, sys, json

PKG = os.path.join(sys.argv[1], 'rounded')
OUT = sys.argv[2]

# name: search tags (the name itself is searchable too). Order = order shown in the picker.
ICONS = """
shopping_cart: groceries grocery supermarket cart food market
grocery: groceries grocery supermarket store market
nutrition: groceries fruit vegetable healthy apple
egg: egg groceries breakfast food
bakery_dining: bread bakery croissant breakfast
restaurant: eating out restaurant food dinner lunch meal
lunch_dining: burger fast food lunch eating out
fastfood: fast food burger fries eating out
local_pizza: pizza fast food eating out
ramen_dining: noodles ramen asian food eating out
rice_bowl: rice bowl biryani asian food meal
kebab_dining: kebab shawarma grill meat food
set_meal: fish seafood meal food
dinner_dining: pasta spaghetti dinner food
brunch_dining: brunch breakfast food
icecream: ice cream dessert sweet snack
cake: cake birthday dessert sweet bakery
cookie: cookie snack sweet biscuit
local_cafe: coffee cafe tea drink cup
coffee: coffee cafe drink cup espresso
coffee_maker: coffee machine kitchen
emoji_food_beverage: tea drink cup beverage
local_bar: bar drinks alcohol cocktail night out
sports_bar: beer bar pub drinks
liquor: liquor alcohol drinks wine
wine_bar: wine drinks bar
water_full: water bottle drink
takeout_dining: takeout delivery food order
moped_package: delivery food order courier uber eats foodpanda
kitchen: kitchen fridge appliance home
directions_bus: bus transport transit commute
directions_car: car auto drive vehicle transport
local_taxi: taxi cab uber ride transport
train: train rail metro transport
subway: subway metro underground train transport
tram: tram streetcar transport
two_wheeler: motorbike motorcycle scooter bike transport
pedal_bike: bicycle bike cycling transport
electric_scooter: scooter e-scooter transport
local_gas_station: fuel gas petrol station car
ev_station: electric charging car ev
local_parking: parking car
car_repair: car repair mechanic garage service
car_rental: car rental hire
flight: flight plane travel airline trip
luggage: luggage travel trip suitcase
hotel: hotel stay travel bed
beach_access: beach holiday vacation travel
directions_boat: boat ferry launch travel
map: map travel trip
confirmation_number: ticket event movie travel
home: home house rent housing
apartment: apartment flat building rent housing
house: house home property
cottage: cottage cabin house home
bed: bed bedroom furniture home
chair: chair furniture home
weekend: sofa couch furniture home
home_repair_service: repair tools maintenance home
cleaning_services: cleaning cleaner maid home
local_laundry_service: laundry washing clothes
bolt: electricity power utilities bill
water_drop: water utility bill
propane_tank: gas cylinder utility bill
wifi: internet wifi broadband bill
router: internet router broadband bill
mobile: phone mobile smartphone top up recharge bkash nagad
mobile_2: phone mobile iphone
call: phone call bill
sim_card: sim mobile phone recharge
receipt_long: bills receipt invoice utilities
receipt: receipt bill invoice
request_quote: bill quote invoice
subscriptions: subscriptions streaming netflix spotify
live_tv: tv television streaming cable
tv: tv television
shopping_bag: shopping bag clothes store mall
shopping_basket: shopping basket market
storefront: store shop retail
local_mall: mall shopping
checkroom: clothes clothing fashion wardrobe hanger
styler: clothes fashion
steps: shoes sneakers footwear
diamond: jewelry diamond valuable asset gold
watch: watch accessories
eyeglasses: glasses optical eyewear
face_3: beauty makeup cosmetics
content_cut: haircut barber salon hair
spa: spa massage wellness self care
dry_cleaning: dry cleaning laundry clothes
redeem: gift present
featured_seasonal_and_gifts: gift present celebration
celebration: party celebration event wedding
cake_add: birthday cake celebration
school: school study education university tuition
menu_book: books textbooks study reading
auto_stories: book reading study
library_books: library books study
science: science lab study
calculate: calculator math study accounting
edit_note: notes stationery study
laptop_windows: laptop computer electronics
computer: computer pc desktop electronics
desktop_windows: monitor computer electronics
headphones: headphones music audio electronics
devices: devices gadgets electronics
print: printing printer print
medication: medicine pharmacy pills health drugs
medical_services: doctor clinic medical health hospital
local_hospital: hospital health emergency
local_pharmacy: pharmacy chemist medicine health
dentistry: dentist teeth dental health
vaccines: vaccine injection health
monitor_heart: heart health checkup
psychology: mental health therapy
health_and_safety: insurance health safety
fitness_center: gym fitness workout exercise
sports_soccer: football soccer sport
sports_cricket: cricket sport
sports_basketball: basketball sport
sports_tennis: tennis sport
pool: swimming pool sport
self_improvement: yoga meditation wellness
hiking: hiking outdoor trip
movie: movies cinema film entertainment fun
theaters: theatre show cinema entertainment
sports_esports: games gaming video games console fun
casino: games gambling dice fun
music_note: music concert songs
piano: piano music instrument
palette: art painting hobby craft
photo_camera: camera photography hobby
local_florist: flowers florist gift
park: park outdoor nature
attractions: fun fair amusement
family_restroom: family parents kids
child_care: baby child kids care
stroller: baby stroller kids
toys: toys kids games
elderly: parents elderly grandparents
favorite: love partner date heart
volunteer_activism: donation charity giving help
diversity_3: friends people group social
groups: group friends people
pets: pets animals dog cat
cruelty_free: pets rabbit animals
mosque: mosque prayer faith religion zakat
church: church faith religion
temple_hindu: temple faith religion
account_balance: bank fees charges institution
payments: cash money payments salary income
attach_money: money dollar cash
currency_exchange: exchange currency forex remittance
savings: savings piggy bank save
account_balance_wallet: wallet mobile wallet bkash money
wallet: wallet money
credit_card: credit card debit card payment
credit_score: credit score loan
paid: paid money dollar coin
price_check: price check cost
sell: sale sell price tag
local_atm: atm cash withdrawal bank
money: money cash notes
real_estate_agent: property agent broker
handshake: loan lending deal agreement
trending_up: investment stocks growth
show_chart: stocks investment chart
monitoring: investment portfolio chart
work: work job office salary
business_center: business work briefcase
badge: id badge work
engineering: engineering work
construction: construction building repair
handyman: repair handyman tools
build: tools repair build
local_shipping: shipping delivery courier truck
package_2: parcel package delivery courier
inventory_2: box storage inventory
mail: post mail letter
local_post_office: post office mail
description: documents papers admin
gavel: legal law court fine
policy: insurance policy protection
security: security insurance protection
shield: insurance protection shield
volunteer_activism: charity donation
public: travel world visa international
language: internet online web
cloud: cloud storage online service
apps: apps software
code: software development coding
key: rent deposit key
lock: lock security
umbrella: umbrella rain insurance
local_fire_department: fire emergency
emergency: emergency urgent
warning: warning fine penalty
category: other misc general category
more_horiz: other misc more
star: favourite star special
bookmark: bookmark saved
label: label tag
flag: flag goal
schedule: time schedule
event: event calendar date
alarm: alarm reminder
lightbulb: idea electricity light
eco: eco plants green
yard: garden plants yard
grass: garden lawn
water: water ocean
forest: nature forest trees
wb_sunny: sun summer
ac_unit: ac cooling air conditioner winter
local_drink: drink water juice
sports_motorsports: motorsports helmet bike
directions_walk: walk walking
add_circle: other add plus income
trending_down: loss down
swap_horiz: transfer swap move exchange
balance: balance fix adjust scale correction
""".strip().splitlines()

seen, out, missing = set(), {}, []
for line in ICONS:
    name, tags = [x.strip() for x in line.split(':', 1)]
    if name in seen: continue
    seen.add(name)
    f = os.path.join(PKG, name + '-fill.svg')
    if not os.path.exists(f): f = os.path.join(PKG, name + '.svg')
    if not os.path.exists(f): missing.append(name); continue
    svg = open(f).read()
    paths = re.findall(r'<path d="([^"]+)"', svg)
    out[name] = [' '.join(paths), tags]
if missing: print('MISSING:', missing)
js = ('/* Tally emblems: a curated subset of Google Material Symbols (Rounded, filled, weight 400),\n'
      '   generated from the npm package @material-symbols/svg-400 v0.47.5.\n'
      '   Material Symbols are licensed under the Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0\n'
      '   Format: name: [svg path data for viewBox "0 -960 960 960", "search tags"] */\n'
      'window.TALLY_ICONS=' + json.dumps(out, separators=(',', ':')) + ';\n')
open(OUT, 'w').write(js)
print(len(out), 'icons,', len(js) // 1024, 'KB')
